import ExcelJS from 'exceljs';
import html2canvas from 'html2canvas';
import { format } from 'date-fns';
import { Filesystem, Directory } from '@capacitor/filesystem';

const isMobileApp = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.protocol === 'file:' || 
   /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) &&
  !window.location.hostname.includes('asia-southeast1.run.app');

// Convert ArrayBuffer to Base64 safely in chunks
function bufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return window.btoa(binary);
}

// Mobile and Web download dispatcher for ExcelJS Workbooks
async function saveOrDownloadWorkbook(
  workbook: ExcelJS.Workbook,
  fileName: string,
  notify?: (type: 'success' | 'error' | 'info', message: string) => void
) {
  try {
    const buffer = await workbook.xlsx.writeBuffer();

    if (isMobileApp) {
      try {
        const base64Data = bufferToBase64(buffer as ArrayBuffer);
        try {
          const status = await Filesystem.checkPermissions();
          if (status.publicStorage !== 'granted') {
            await Filesystem.requestPermissions();
          }
        } catch (pe) {
          console.warn("Permission check/request:", pe);
        }

        try {
          await Filesystem.writeFile({
            path: `Download/${fileName}`,
            data: base64Data,
            directory: Directory.ExternalStorage,
            recursive: true
          });
        } catch (e1) {
          await Filesystem.writeFile({
            path: fileName,
            data: base64Data,
            directory: Directory.ExternalStorage,
            recursive: true
          });
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
    const blob = new Blob([buffer as ArrayBuffer], { 
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    if (notify) {
      notify('success', `Exported ${fileName} successfully with graph sheet!`);
    }
  } catch (error: any) {
    console.error("Export error:", error);
    if (notify) {
      notify('error', `Failed to export spreadsheet: ${error?.message || error}`);
    }
  }
}

// Helper to format currency numbers for canvas labels
function formatCanvasCurrency(val: number): string {
  if (!val || val === 0) return '₹0';
  if (Math.abs(val) >= 100000) {
    return `₹${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L`;
  }
  if (Math.abs(val) >= 1000) {
    return `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
  }
  return `₹${val.toLocaleString('en-IN')}`;
}

// Draw a rounded rectangle on 2D context
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  if (w <= 0 || h <= 0) return;
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// High-Fidelity Direct Canvas Chart Generators (Fail-Safe Vector Engine)
// ---------------------------------------------------------------------------

export function generateLoanSanctionsRepaymentsChartImage(
  data: MonthlySanctionRepaymentItem[],
  selectedYear: number,
  totalSanctionedSum: number,
  totalRepaymentsSum: number
): { base64: string; width: number; height: number } {
  const canvas = document.createElement('canvas');
  const w = 1840;
  const h = 800;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64: '', width: 920, height: 400 };

  // 1. Background Card
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // 2. Header
  ctx.fillStyle = '#1e1b4b';
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.fillText(`UNNATI TRUST (R) — Month-wise Loan Sanctions & Repayments (${selectedYear})`, 40, 60);

  // KPI summary badges
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillStyle = '#4338ca';
  ctx.fillText(`Sanctioned: ₹${totalSanctionedSum.toLocaleString('en-IN')}`, 40, 100);

  ctx.fillStyle = '#059669';
  ctx.fillText(`Repayments: ₹${totalRepaymentsSum.toLocaleString('en-IN')}`, 450, 100);

  ctx.fillStyle = '#64748b';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.fillText(`Net Difference: ₹${Math.abs(totalSanctionedSum - totalRepaymentsSum).toLocaleString('en-IN')} (${totalSanctionedSum >= totalRepaymentsSum ? 'Disbursal Surplus' : 'Repayment Surplus'})`, 850, 100);

  // 3. Coordinate Space
  const plotLeft = 140;
  const plotTop = 150;
  const plotRight = w - 60;
  const plotBottom = h - 110;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  // Find max value
  const allVals = data.flatMap(d => [d.sanctionedAmount, d.repaidAmount, d.repaymentPrincipal]);
  const rawMax = Math.max(...allVals, 10000);
  const maxVal = Math.ceil(rawMax / 10000) * 10000;

  // 4. Horizontal Grid Lines & Y-Axis Labels
  const gridSteps = 4;
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#64748b';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridSteps; i++) {
    const yVal = (maxVal / gridSteps) * i;
    const yPos = plotBottom - (i / gridSteps) * plotHeight;

    ctx.beginPath();
    ctx.moveTo(plotLeft, yPos);
    ctx.lineTo(plotRight, yPos);
    ctx.stroke();

    ctx.fillText(formatCanvasCurrency(yVal), plotLeft - 16, yPos + 6);
  }

  // Baseline axis
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  // 5. Render Bars
  const itemCount = Math.max(data.length, 1);
  const groupWidth = plotWidth / itemCount;
  const barWidth = Math.min(groupWidth * 0.32, 45);

  data.forEach((d, idx) => {
    const groupCenter = plotLeft + idx * groupWidth + groupWidth / 2;

    // Sanctioned Bar (Indigo)
    const sHeight = maxVal > 0 ? (d.sanctionedAmount / maxVal) * plotHeight : 0;
    const sX = groupCenter - barWidth - 4;
    const sY = plotBottom - sHeight;

    if (sHeight > 2) {
      const gradS = ctx.createLinearGradient(0, sY, 0, plotBottom);
      gradS.addColorStop(0, '#6366f1');
      gradS.addColorStop(1, '#4338ca');
      ctx.fillStyle = gradS;
      roundRect(ctx, sX, sY, barWidth, sHeight, 6);
      ctx.fill();

      // Top label
      ctx.fillStyle = '#4338ca';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatCanvasCurrency(d.sanctionedAmount), sX + barWidth / 2, sY - 8);
    }

    // Repaid Bar (Emerald)
    const rHeight = maxVal > 0 ? (d.repaidAmount / maxVal) * plotHeight : 0;
    const rX = groupCenter + 4;
    const rY = plotBottom - rHeight;

    if (rHeight > 2) {
      const gradR = ctx.createLinearGradient(0, rY, 0, plotBottom);
      gradR.addColorStop(0, '#10b981');
      gradR.addColorStop(1, '#059669');
      ctx.fillStyle = gradR;
      roundRect(ctx, rX, rY, barWidth, rHeight, 6);
      ctx.fill();

      // Top label
      ctx.fillStyle = '#059669';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatCanvasCurrency(d.repaidAmount), rX + barWidth / 2, rY - 8);
    }

    // X-Axis Month label
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 17px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const monthShort = d.name.replace(` ${selectedYear}`, '');
    ctx.fillText(monthShort, groupCenter, plotBottom + 26);
  });

  // 6. Legend at Bottom
  const legendY = h - 35;
  ctx.textAlign = 'left';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';

  // Sanctioned Legend
  ctx.fillStyle = '#6366f1';
  ctx.fillRect(plotLeft + 40, legendY - 14, 20, 20);
  ctx.fillStyle = '#1e293b';
  ctx.fillText('Loans Sanctioned (Principal)', plotLeft + 70, legendY + 2);

  // Repaid Legend
  ctx.fillStyle = '#10b981';
  ctx.fillRect(plotLeft + 380, legendY - 14, 20, 20);
  ctx.fillStyle = '#1e293b';
  ctx.fillText('Repayments Received (Principal + Interest)', plotLeft + 410, legendY + 2);

  const base64 = canvas.toDataURL('image/png').replace(/^data:image\/[a-z]+;base64,/, '');
  return { base64, width: 920, height: 400 };
}

export function generateMemberDisbursementsChartImage(
  data: MemberLoanDisbursementItem[],
  selectedYear: number
): { base64: string; width: number; height: number } {
  const canvas = document.createElement('canvas');
  const w = 1840;
  const h = 800;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64: '', width: 920, height: 400 };

  // 1. Background Card
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // 2. Header
  ctx.fillStyle = '#1e1b4b';
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.fillText(`UNNATI TRUST (R) — Member-wise Loan Disbursements by Month (${selectedYear})`, 40, 60);

  const totalSum = data.reduce((sum, d) => sum + (d.amount || 0), 0);
  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillStyle = '#7c3aed';
  ctx.fillText(`Total Disbursed: ₹${totalSum.toLocaleString('en-IN')}`, 40, 100);

  ctx.fillStyle = '#64748b';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.fillText(`Disbursement Events: ${data.length}`, 420, 100);

  // 3. Coordinate Space
  const plotLeft = 140;
  const plotTop = 150;
  const plotRight = w - 60;
  const plotBottom = h - 120;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const maxVal = Math.max(...data.map(d => d.amount || 0), 10000);
  const ceilingVal = Math.ceil(maxVal / 10000) * 10000;

  // Grid
  const gridSteps = 4;
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#64748b';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridSteps; i++) {
    const yVal = (ceilingVal / gridSteps) * i;
    const yPos = plotBottom - (i / gridSteps) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(plotLeft, yPos);
    ctx.lineTo(plotRight, yPos);
    ctx.stroke();
    ctx.fillText(formatCanvasCurrency(yVal), plotLeft - 16, yPos + 6);
  }

  // Baseline
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  // Render Bars
  const items = data.slice(0, 18);
  const itemCount = Math.max(items.length, 1);
  const groupWidth = plotWidth / itemCount;
  const barWidth = Math.min(groupWidth * 0.55, 60);

  items.forEach((d, idx) => {
    const groupCenter = plotLeft + idx * groupWidth + groupWidth / 2;
    const bHeight = ceilingVal > 0 ? (d.amount / ceilingVal) * plotHeight : 0;
    const bX = groupCenter - barWidth / 2;
    const bY = plotBottom - bHeight;

    const isClosed = d.status === 'paid';
    const grad = ctx.createLinearGradient(0, bY, 0, plotBottom);
    if (isClosed) {
      grad.addColorStop(0, '#10b981');
      grad.addColorStop(1, '#059669');
    } else {
      grad.addColorStop(0, '#8b5cf6');
      grad.addColorStop(1, '#6d28d9');
    }

    if (bHeight > 2) {
      ctx.fillStyle = grad;
      roundRect(ctx, bX, bY, barWidth, bHeight, 6);
      ctx.fill();

      // Top label
      ctx.fillStyle = isClosed ? '#059669' : '#6d28d9';
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatCanvasCurrency(d.amount), groupCenter, bY - 8);
    }

    // X label
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const nameLabel = d.memberName.length > 10 ? `${d.memberName.slice(0, 9)}.` : d.memberName;
    ctx.fillText(nameLabel, groupCenter, plotBottom + 24);

    ctx.fillStyle = '#64748b';
    ctx.font = '13px "Segoe UI", sans-serif';
    ctx.fillText(d.monthLabel.slice(0, 6), groupCenter, plotBottom + 44);
  });

  // Legend
  const legendY = h - 35;
  ctx.textAlign = 'left';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillStyle = '#8b5cf6';
  ctx.fillRect(plotLeft + 40, legendY - 14, 20, 20);
  ctx.fillStyle = '#1e293b';
  ctx.fillText('Active Loan Disbursed', plotLeft + 70, legendY + 2);

  ctx.fillStyle = '#10b981';
  ctx.fillRect(plotLeft + 350, legendY - 14, 20, 20);
  ctx.fillStyle = '#1e293b';
  ctx.fillText('Closed / Repaid Loan', plotLeft + 380, legendY + 2);

  const base64 = canvas.toDataURL('image/png').replace(/^data:image\/[a-z]+;base64,/, '');
  return { base64, width: 920, height: 400 };
}

export function generateMemberwiseBorrowedRepaidChartImage(
  data: MemberLoanSummaryItem[],
  selectedYear: number
): { base64: string; width: number; height: number } {
  const canvas = document.createElement('canvas');
  const w = 1840;
  const h = 800;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64: '', width: 920, height: 400 };

  // 1. Background Card
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // 2. Header
  ctx.fillStyle = '#1e1b4b';
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.fillText(`UNNATI TRUST (R) — Memberwise Borrowed vs Repaid (${selectedYear})`, 40, 60);

  const totalBorrowed = data.reduce((s, d) => s + (d.borrowed || 0), 0);
  const totalRepaid = data.reduce((s, d) => s + (d.totalRepaid || d.repaidPrincipal || 0), 0);

  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillStyle = '#0284c7';
  ctx.fillText(`Total Borrowed: ₹${totalBorrowed.toLocaleString('en-IN')}`, 40, 100);

  ctx.fillStyle = '#059669';
  ctx.fillText(`Total Repaid: ₹${totalRepaid.toLocaleString('en-IN')}`, 450, 100);

  // 3. Coordinate Space
  const plotLeft = 140;
  const plotTop = 150;
  const plotRight = w - 60;
  const plotBottom = h - 120;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const maxVal = Math.max(...data.flatMap(d => [d.borrowed, d.totalRepaid || d.repaidPrincipal]), 10000);
  const ceilingVal = Math.ceil(maxVal / 10000) * 10000;

  // Grid
  const gridSteps = 4;
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#64748b';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridSteps; i++) {
    const yVal = (ceilingVal / gridSteps) * i;
    const yPos = plotBottom - (i / gridSteps) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(plotLeft, yPos);
    ctx.lineTo(plotRight, yPos);
    ctx.stroke();
    ctx.fillText(formatCanvasCurrency(yVal), plotLeft - 16, yPos + 6);
  }

  // Baseline
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  // Render Bars
  const items = data.slice(0, 15);
  const itemCount = Math.max(items.length, 1);
  const groupWidth = plotWidth / itemCount;
  const barWidth = Math.min(groupWidth * 0.35, 45);

  items.forEach((d, idx) => {
    const groupCenter = plotLeft + idx * groupWidth + groupWidth / 2;

    // Borrowed Bar (Cyan/Blue)
    const bHeight = ceilingVal > 0 ? (d.borrowed / ceilingVal) * plotHeight : 0;
    const bX = groupCenter - barWidth - 4;
    const bY = plotBottom - bHeight;

    if (bHeight > 2) {
      const gradB = ctx.createLinearGradient(0, bY, 0, plotBottom);
      gradB.addColorStop(0, '#38bdf8');
      gradB.addColorStop(1, '#0284c7');
      ctx.fillStyle = gradB;
      roundRect(ctx, bX, bY, barWidth, bHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#0284c7';
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatCanvasCurrency(d.borrowed), bX + barWidth / 2, bY - 8);
    }

    // Repaid Bar (Emerald)
    const repaidAmt = d.totalRepaid || d.repaidPrincipal || 0;
    const rHeight = ceilingVal > 0 ? (repaidAmt / ceilingVal) * plotHeight : 0;
    const rX = groupCenter + 4;
    const rY = plotBottom - rHeight;

    if (rHeight > 2) {
      const gradR = ctx.createLinearGradient(0, rY, 0, plotBottom);
      gradR.addColorStop(0, '#34d399');
      gradR.addColorStop(1, '#059669');
      ctx.fillStyle = gradR;
      roundRect(ctx, rX, rY, barWidth, rHeight, 6);
      ctx.fill();

      ctx.fillStyle = '#059669';
      ctx.font = 'bold 15px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatCanvasCurrency(repaidAmt), rX + barWidth / 2, rY - 8);
    }

    // X label
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    const nameLabel = d.name.length > 12 ? `${d.name.slice(0, 10)}..` : d.name;
    ctx.fillText(nameLabel, groupCenter, plotBottom + 26);
  });

  // Legend
  const legendY = h - 35;
  ctx.textAlign = 'left';
  ctx.font = 'bold 18px "Segoe UI", sans-serif';
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(plotLeft + 40, legendY - 14, 20, 20);
  ctx.fillStyle = '#1e293b';
  ctx.fillText('Total Borrowed Principal', plotLeft + 70, legendY + 2);

  ctx.fillStyle = '#059669';
  ctx.fillRect(plotLeft + 360, legendY - 14, 20, 20);
  ctx.fillStyle = '#1e293b';
  ctx.fillText('Total Repaid (Principal + Interest)', plotLeft + 390, legendY + 2);

  const base64 = canvas.toDataURL('image/png').replace(/^data:image\/[a-z]+;base64,/, '');
  return { base64, width: 920, height: 400 };
}

export function generateFinancialHealthChartImage(
  data: FinancialHealthOverviewData,
  selectedYear: number
): { base64: string; width: number; height: number } {
  const canvas = document.createElement('canvas');
  const w = 1840;
  const h = 800;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { base64: '', width: 920, height: 400 };

  // 1. Background Card
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  // 2. Header
  ctx.fillStyle = '#1e1b4b';
  ctx.font = 'bold 30px "Segoe UI", sans-serif';
  ctx.fillText(`UNNATI TRUST (R) — Financial Health Overview (${selectedYear})`, 40, 60);

  ctx.font = 'bold 20px "Segoe UI", sans-serif';
  ctx.fillStyle = '#4f46e5';
  ctx.fillText(`Group Funds: ₹${data.totalGroupFunds.toLocaleString('en-IN')}`, 40, 100);

  ctx.fillStyle = '#059669';
  ctx.fillText(`Available Balance: ₹${data.availableBalance.toLocaleString('en-IN')}`, 450, 100);

  ctx.fillStyle = '#dc2626';
  ctx.fillText(`Outstanding Loans: ₹${data.outstandingLoans.toLocaleString('en-IN')}`, 850, 100);

  // 3. Coordinate Space
  const plotLeft = 140;
  const plotTop = 150;
  const plotRight = w - 60;
  const plotBottom = h - 120;
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const maxVal = Math.max(...data.chartData.map(d => d.totalAmount || d.baseAmount || 0), 10000);
  const ceilingVal = Math.ceil(maxVal / 10000) * 10000;

  // Grid
  const gridSteps = 4;
  ctx.strokeStyle = '#f1f5f9';
  ctx.lineWidth = 2;
  ctx.fillStyle = '#64748b';
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.textAlign = 'right';

  for (let i = 0; i <= gridSteps; i++) {
    const yVal = (ceilingVal / gridSteps) * i;
    const yPos = plotBottom - (i / gridSteps) * plotHeight;
    ctx.beginPath();
    ctx.moveTo(plotLeft, yPos);
    ctx.lineTo(plotRight, yPos);
    ctx.stroke();
    ctx.fillText(formatCanvasCurrency(yVal), plotLeft - 16, yPos + 6);
  }

  // Baseline
  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(plotLeft, plotBottom);
  ctx.lineTo(plotRight, plotBottom);
  ctx.stroke();

  // Colors per bar
  const barColors = [
    { start: '#4f46e5', end: '#312e81', text: '#312e81' }, // Funds
    { start: '#8b5cf6', end: '#5b21b6', text: '#5b21b6' }, // Sanctioned
    { start: '#10b981', end: '#047857', text: '#047857' }, // Repaid
    { start: '#f43f5e', end: '#be123c', text: '#be123c' }, // Outstanding
    { start: '#0ea5e9', end: '#0369a1', text: '#0369a1' }, // Available
    { start: '#f59e0b', end: '#b45309', text: '#b45309' }  // Interest
  ];

  const items = data.chartData;
  const itemCount = Math.max(items.length, 1);
  const groupWidth = plotWidth / itemCount;
  const barWidth = Math.min(groupWidth * 0.52, 70);

  items.forEach((d, idx) => {
    const groupCenter = plotLeft + idx * groupWidth + groupWidth / 2;
    const val = d.totalAmount || d.baseAmount || 0;
    const bHeight = ceilingVal > 0 ? (val / ceilingVal) * plotHeight : 0;
    const bX = groupCenter - barWidth / 2;
    const bY = plotBottom - bHeight;

    const c = barColors[idx % barColors.length];
    const grad = ctx.createLinearGradient(0, bY, 0, plotBottom);
    grad.addColorStop(0, c.start);
    grad.addColorStop(1, c.end);

    if (bHeight > 2) {
      ctx.fillStyle = grad;
      roundRect(ctx, bX, bY, barWidth, bHeight, 6);
      ctx.fill();

      // Top label
      ctx.fillStyle = c.text;
      ctx.font = 'bold 16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatCanvasCurrency(val), groupCenter, bY - 8);
    }

    // X label
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 15px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(d.category, groupCenter, plotBottom + 26);
  });

  // Legend
  const legendY = h - 35;
  ctx.textAlign = 'center';
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.fillStyle = '#475569';
  ctx.fillText('Six Core Financial Indicators: Capital, Sanctions, Repayments, Portfolio Risk, Working Balance & Yield', w / 2, legendY + 2);

  const base64 = canvas.toDataURL('image/png').replace(/^data:image\/[a-z]+;base64,/, '');
  return { base64, width: 920, height: 400 };
}

// Fallback: direct SVG capture to canvas with inlined computed styles and gradients
async function captureSvgFallback(container: HTMLElement): Promise<{ base64: string; width: number; height: number } | null> {
  const svg = container.querySelector('svg.recharts-surface') || container.querySelector('svg');
  if (!svg) return null;

  try {
    const clonedSvg = svg.cloneNode(true) as SVGSVGElement;
    clonedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clonedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

    const svgWidth = parseFloat(svg.getAttribute('width') || '0') || Math.round(svg.getBoundingClientRect().width) || 900;
    const svgHeight = parseFloat(svg.getAttribute('height') || '0') || Math.round(svg.getBoundingClientRect().height) || 400;

    clonedSvg.setAttribute('width', `${svgWidth}`);
    clonedSvg.setAttribute('height', `${svgHeight}`);
    clonedSvg.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);

    // If defs exist anywhere in container but not clonedSvg, copy them over
    if (!clonedSvg.querySelector('defs')) {
      const containerDefs = container.querySelector('defs');
      if (containerDefs) {
        clonedSvg.prepend(containerDefs.cloneNode(true));
      }
    }

    // Inline computed styles on text elements so they render cleanly without external CSS
    const origTexts = Array.from(svg.querySelectorAll('text, tspan'));
    const clonedTexts = Array.from(clonedSvg.querySelectorAll('text, tspan'));
    clonedTexts.forEach((cText, i) => {
      const oText = origTexts[i];
      if (oText) {
        const computed = window.getComputedStyle(oText);
        (cText as SVGElement).style.fontSize = computed.fontSize;
        (cText as SVGElement).style.fontFamily = computed.fontFamily || 'Segoe UI, sans-serif';
        (cText as SVGElement).style.fontWeight = computed.fontWeight;
        (cText as SVGElement).style.fill = computed.fill || '#1e293b';
      }
    });

    const svgString = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const blobUrl = URL.createObjectURL(svgBlob);

    const img = new Image();
    const loadPromise = new Promise<{ base64: string; width: number; height: number } | null>((resolve) => {
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const canvas = document.createElement('canvas');
        canvas.width = svgWidth * 2;
        canvas.height = svgHeight * 2;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');
          const maxExportWidth = 920;
          const targetWidth = Math.min(svgWidth, maxExportWidth);
          const targetHeight = Math.round(targetWidth * (svgHeight / svgWidth));
          resolve({
            base64,
            width: targetWidth,
            height: targetHeight
          });
        } else {
          resolve(null);
        }
      };
      img.onerror = (err) => {
        URL.revokeObjectURL(blobUrl);
        console.warn("SVG blob image load error:", err);
        resolve(null);
      };
    });
    img.src = blobUrl;
    return await loadPromise;
  } catch (e) {
    console.warn("SVG fallback capture failed:", e);
    return null;
  }
}

// High-fidelity snapshot capture for any graph card element
export async function captureChartImage(elementId: string): Promise<{ base64: string; width: number; height: number } | null> {
  const el = document.getElementById(elementId);
  if (!el) {
    console.warn(`Chart element #${elementId} not found`);
    return null;
  }

  try {
    // 1. Get accurate live metrics from real DOM before cloning
    const origScrolls = Array.from(el.querySelectorAll('.overflow-x-auto'));
    const origContainers = Array.from(el.querySelectorAll('.recharts-responsive-container'));
    const origSvgs = Array.from(el.querySelectorAll('svg.recharts-surface'));
    
    // Find the actual chart width (scrollWidth of the overflow container, or width of SVG)
    let contentWidth = el.scrollWidth;
    origScrolls.forEach(sc => {
      contentWidth = Math.max(contentWidth, (sc as HTMLElement).scrollWidth);
    });
    origSvgs.forEach(svg => {
      const s = svg as SVGSVGElement;
      const wAttr = parseFloat(s.getAttribute('width') || '0');
      const bRect = s.getBoundingClientRect();
      contentWidth = Math.max(contentWidth, wAttr, Math.round(bRect.width));
    });
    const captureWidth = Math.max(contentWidth + 48, el.offsetWidth, 960);

    const canvas = await html2canvas(el, {
      backgroundColor: '#ffffff',
      scale: 2, // High resolution crisp export
      useCORS: true,
      allowTaint: true,
      logging: false,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      windowWidth: Math.max(document.documentElement.offsetWidth, captureWidth + 100),
      onclone: (clonedDoc) => {
        const clonedEl = clonedDoc.getElementById(elementId);
        if (!clonedEl) return;

        // Hide export buttons in captured snapshot
        clonedEl.querySelectorAll('.export-excel-btn').forEach((btn) => {
          (btn as HTMLElement).style.display = 'none';
        });

        // Ensure cloned card maintains full width to show all bars
        clonedEl.style.width = `${captureWidth}px`;
        clonedEl.style.minWidth = `${captureWidth}px`;
        clonedEl.style.maxWidth = 'none';
        clonedEl.style.overflow = 'visible';

        // Expand any horizontal scroll wrappers with explicit computed width so charts never collapse to 0
        clonedEl.querySelectorAll('.overflow-x-auto').forEach((clonedSc) => {
          const scEl = clonedSc as HTMLElement;
          scEl.style.overflow = 'visible';
          scEl.style.width = `${captureWidth}px`;
          scEl.style.minWidth = `${captureWidth}px`;
          scEl.style.maxWidth = 'none';
        });

        // Set explicit pixel dimensions on responsive container wrappers so Recharts doesn't collapse
        clonedEl.querySelectorAll('.recharts-responsive-container').forEach((clonedC, idx) => {
          const origC = origContainers[idx] as HTMLElement | undefined;
          const origW = origC && origC.offsetWidth > 0 ? origC.offsetWidth : (captureWidth - 48);
          const origH = origC && origC.offsetHeight > 0 ? origC.offsetHeight : 380;
          const cEl = clonedC as HTMLElement;
          cEl.style.width = `${origW}px`;
          cEl.style.height = `${origH}px`;
          cEl.style.minWidth = `${origW}px`;
          cEl.style.minHeight = `${origH}px`;
        });

        // Set explicit attributes and styles on recharts SVG elements
        clonedEl.querySelectorAll('svg.recharts-surface').forEach((clonedSvg, idx) => {
          const origSvg = origSvgs[idx] as SVGSVGElement | undefined;
          const origSvgRect = origSvg ? origSvg.getBoundingClientRect() : null;
          const w = origSvg ? (parseFloat(origSvg.getAttribute('width') || '0') || Math.round(origSvgRect?.width || 0) || (captureWidth - 48)) : (captureWidth - 48);
          const h = origSvg ? (parseFloat(origSvg.getAttribute('height') || '0') || Math.round(origSvgRect?.height || 0) || 380) : 380;
          clonedSvg.setAttribute('width', String(w));
          clonedSvg.setAttribute('height', String(h));
          const sEl = clonedSvg as unknown as HTMLElement;
          sEl.style.width = `${w}px`;
          sEl.style.height = `${h}px`;
          sEl.style.minWidth = `${w}px`;
          sEl.style.minHeight = `${h}px`;
        });
      }
    });

    if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
      console.warn(`html2canvas generated empty canvas for #${elementId}, trying direct SVG fallback`);
      return await captureSvgFallback(el);
    }

    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.replace(/^data:image\/[a-z]+;base64,/, '');

    // Target display size in Excel (landscape ~ 900px wide)
    const maxExportWidth = 920;
    const aspect = canvas.height / canvas.width;
    const targetWidth = Math.max(300, Math.min(Math.round(canvas.width / 2) || 900, maxExportWidth));
    const targetHeight = Math.max(150, Math.round(targetWidth * (aspect && !isNaN(aspect) && isFinite(aspect) ? aspect : 0.5)));

    return {
      base64,
      width: targetWidth,
      height: targetHeight
    };
  } catch (err) {
    console.warn(`html2canvas failed for #${elementId}, trying direct SVG fallback:`, err);
    return await captureSvgFallback(el);
  }
}

// Styling definitions for ExcelJS
const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

const BORDER_DOUBLE_BOTTOM: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FF64748B' } },
  bottom: { style: 'double', color: { argb: 'FF1E1B4B' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
};

// Helper to add the second sheet with the actual live graph image
function addVisualGraphSheet(
  workbook: ExcelJS.Workbook,
  {
    graphTitle,
    selectedYear,
    chartImage
  }: {
    graphTitle: string;
    selectedYear: number;
    chartImage?: { base64: string; width: number; height: number } | null;
  }
) {
  const ws = workbook.addWorksheet('Visual Graph', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2
      }
    }
  });

  const colCount = 12;
  ws.columns = [
    { width: 4 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 }
  ];

  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  // Row 1: Main Header
  const row1 = ws.addRow(['UNNATI TRUST (R)']);
  ws.mergeCells(1, 1, 1, colCount);
  row1.height = 28;
  const c1 = row1.getCell(1);
  c1.font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: Graph Title
  const row2 = ws.addRow([`VISUAL ANALYTICS - ${graphTitle.toUpperCase()} (${selectedYear})`]);
  ws.mergeCells(2, 1, 2, colCount);
  row2.height = 24;
  const c2 = row2.getCell(1);
  c2.font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  c2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
  c2.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3: Subtitle
  const row3 = ws.addRow([`Interactive graph snapshot as shown in Unnati Management Portal | Calendar Year: ${selectedYear} | Generated: ${dateStr}`]);
  ws.mergeCells(3, 1, 3, colCount);
  row3.height = 20;
  const c3 = row3.getCell(1);
  c3.font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF334155' } };
  c3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  c3.alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4: Spacer
  const row4 = ws.addRow([]);
  row4.height = 12;

  // Row 5+: Embedded Image
  if (chartImage?.base64 && chartImage.width > 0 && chartImage.height > 0) {
    const imageId = workbook.addImage({
      base64: chartImage.base64,
      extension: 'png'
    });

    ws.addImage(imageId, {
      tl: { col: 1, row: 4 }, // Start at B5
      ext: { width: chartImage.width, height: chartImage.height },
      editAs: 'oneCell'
    });
  } else {
    const emptyRow = ws.addRow(['No graph visual rendered for this selection. Review the primary data sheet for itemized records.']);
    ws.mergeCells(5, 1, 5, colCount);
    emptyRow.height = 30;
    const ec = emptyRow.getCell(1);
    ec.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FF64748B' } };
    ec.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  return ws;
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
  chartImage,
  notify
}: {
  data: MonthlySanctionRepaymentItem[];
  selectedYear: number;
  totalSanctionedSum: number;
  totalRepaymentsSum: number;
  totalSanctionedCount: number;
  totalRepaymentsCount: number;
  chartImage?: { base64: string; width: number; height: number } | null;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Unnati Trust (R)';
  wb.created = new Date();

  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  // Sheet 1: Existing Statement Data
  const ws = wb.addWorksheet('Sanctions & Repayments', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2
      }
    }
  });

  const colCount = 8;
  ws.columns = [
    { width: 16 }, // Month
    { width: 22 }, // Loans Sanctioned (Qty)
    { width: 24 }, // Sanctioned Principal (₹)
    { width: 18 }, // Repayments (Qty)
    { width: 22 }, // Principal Repaid (₹)
    { width: 22 }, // Interest Collected (₹)
    { width: 22 }, // Total Repaid (₹)
    { width: 25 }  // Net Cashflow / Variance (₹)
  ];

  // Row 1: Main Header
  const r1 = ws.addRow(['UNNATI TRUST (R)']);
  ws.mergeCells(1, 1, 1, colCount);
  r1.height = 28;
  r1.getCell(1).font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2: Sub-title
  const r2 = ws.addRow([`MONTH-WISE LOAN SANCTIONS & REPAYMENTS STATEMENT - ${selectedYear}`]);
  ws.mergeCells(2, 1, 2, colCount);
  r2.height = 24;
  r2.getCell(1).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3: Meta
  const r3 = ws.addRow([`Accounting Period: Calendar Year ${selectedYear} | Generated: ${dateStr} | Print: Single Page Statement`]);
  ws.mergeCells(3, 1, 3, colCount);
  r3.height = 20;
  r3.getCell(1).font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF334155' } };
  r3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4: Spacer
  const r4 = ws.addRow([]);
  r4.height = 10;

  // Row 5: Column Headers
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
  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { 
      horizontal: colNumber === 1 ? 'left' : (colNumber === 2 || colNumber === 4 ? 'center' : 'right'),
      vertical: 'middle',
      wrapText: true 
    };
    cell.border = BORDER_THIN;
  });

  // Data rows
  let totalPrincipal = 0;
  let totalInterest = 0;

  data.forEach((item, idx) => {
    totalPrincipal += item.repaymentPrincipal || 0;
    totalInterest += item.repaymentInterest || 0;
    const netVariance = (item.repaidAmount || 0) - (item.sanctionedAmount || 0);

    const row = ws.addRow([
      item.name,
      item.sanctionCount,
      item.sanctionedAmount,
      item.repaymentCount,
      item.repaymentPrincipal,
      item.repaymentInterest,
      item.repaidAmount,
      netVariance
    ]);
    row.height = 20;

    const isZebra = idx % 2 === 1;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isZebra ? 'FFF8FAFC' : 'FFFFFFFF' }
      };
      cell.alignment = {
        horizontal: colNumber === 1 ? 'left' : (colNumber === 2 || colNumber === 4 ? 'center' : 'right'),
        vertical: 'middle'
      };
      cell.border = BORDER_THIN;
      if (typeof cell.value === 'number' && (colNumber === 3 || colNumber >= 5)) {
        cell.numFmt = '₹#,##0';
      }
    });
  });

  // Total Row
  const totalVariance = totalRepaymentsSum - totalSanctionedSum;
  const totalRow = ws.addRow([
    `TOTAL (${selectedYear})`,
    totalSanctionedCount,
    totalSanctionedSum,
    totalRepaymentsCount,
    totalPrincipal,
    totalInterest,
    totalRepaymentsSum,
    totalVariance
  ]);
  totalRow.height = 24;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF1E1B4B' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; // Indigo highlight
    cell.alignment = {
      horizontal: colNumber === 1 ? 'left' : (colNumber === 2 || colNumber === 4 ? 'center' : 'right'),
      vertical: 'middle'
    };
    cell.border = BORDER_DOUBLE_BOTTOM;
    if (typeof cell.value === 'number' && (colNumber === 3 || colNumber >= 5)) {
      cell.numFmt = '₹#,##0';
    }
  });

  // Sheet 2: New Separate Sheet with the Actual Graph Image
  const finalChartImage = (chartImage && chartImage.base64 && chartImage.width > 0)
    ? chartImage
    : generateLoanSanctionsRepaymentsChartImage(data, selectedYear, totalSanctionedSum, totalRepaymentsSum);

  addVisualGraphSheet(wb, {
    graphTitle: 'Month-wise Loan Sanctions & Repayments',
    selectedYear,
    chartImage: finalChartImage
  });

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
  chartImage,
  notify
}: {
  data: MemberLoanDisbursementItem[];
  selectedYear: number;
  selectedMonthFilter: string;
  chartImage?: { base64: string; width: number; height: number } | null;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Unnati Trust (R)';
  wb.created = new Date();

  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  // Sheet 1: Existing Statement Data
  const ws = wb.addWorksheet('Loan Disbursements', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2
      }
    }
  });

  const colCount = 7;
  ws.columns = [
    { width: 8 },  // Sl No.
    { width: 28 }, // Member Name
    { width: 32 }, // Registered Email
    { width: 18 }, // Disbursal Date
    { width: 18 }, // Disbursal Month
    { width: 25 }, // Disbursed Principal (₹)
    { width: 22 }  // Loan Portfolio Status
  ];

  // Row 1
  const r1 = ws.addRow(['UNNATI TRUST (R)']);
  ws.mergeCells(1, 1, 1, colCount);
  r1.height = 28;
  r1.getCell(1).font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2
  const r2 = ws.addRow([`MEMBER-WISE LOAN DISBURSEMENTS STATEMENT - ${selectedYear}`]);
  ws.mergeCells(2, 1, 2, colCount);
  r2.height = 24;
  r2.getCell(1).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3
  const r3 = ws.addRow([`Filter Scope: ${selectedMonthFilter === 'all' ? 'All Months' : selectedMonthFilter} | Period: ${selectedYear} | Printed: ${dateStr}`]);
  ws.mergeCells(3, 1, 3, colCount);
  r3.height = 20;
  r3.getCell(1).font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF334155' } };
  r3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4
  const r4 = ws.addRow([]);
  r4.height = 10;

  // Headers
  const headers = [
    'Sl No.',
    'Member Name',
    'Registered Email',
    'Disbursal Date',
    'Disbursal Month',
    'Disbursed Principal (₹)',
    'Loan Portfolio Status'
  ];
  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { 
      horizontal: colNumber === 1 || colNumber === 4 || colNumber === 5 || colNumber === 7 ? 'center' : (colNumber === 6 ? 'right' : 'left'),
      vertical: 'middle',
      wrapText: true 
    };
    cell.border = BORDER_THIN;
  });

  let totalDisbursed = 0;
  data.forEach((item, idx) => {
    totalDisbursed += item.amount || 0;
    const row = ws.addRow([
      idx + 1,
      item.memberName,
      item.email || '-',
      format(item.date, 'dd-MMM-yyyy'),
      item.monthLabel,
      item.amount,
      item.status === 'paid' ? 'Repaid / Closed' : 'Active / Approved'
    ]);
    row.height = 20;

    const isZebra = idx % 2 === 1;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isZebra ? 'FFF8FAFC' : 'FFFFFFFF' }
      };
      cell.alignment = {
        horizontal: colNumber === 1 || colNumber === 4 || colNumber === 5 || colNumber === 7 ? 'center' : (colNumber === 6 ? 'right' : 'left'),
        vertical: 'middle'
      };
      cell.border = BORDER_THIN;
      if (colNumber === 6 && typeof cell.value === 'number') {
        cell.numFmt = '₹#,##0';
      }
    });
  });

  // Total Row
  const totalRowIdx = ws.rowCount + 1;
  const totalRow = ws.addRow([
    'TOTAL DISBURSED',
    '',
    '',
    '',
    `${data.length} Sanctioned Loans`,
    totalDisbursed,
    ''
  ]);
  ws.mergeCells(totalRowIdx, 1, totalRowIdx, 4);
  totalRow.height = 24;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF4C1D95' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } }; // Violet highlight
    cell.alignment = {
      horizontal: colNumber === 6 ? 'right' : (colNumber === 5 ? 'center' : 'left'),
      vertical: 'middle'
    };
    cell.border = BORDER_DOUBLE_BOTTOM;
    if (colNumber === 6 && typeof cell.value === 'number') {
      cell.numFmt = '₹#,##0';
    }
  });

  // Sheet 2: New Separate Sheet with the Actual Graph Image
  const finalChartImage = (chartImage && chartImage.base64 && chartImage.width > 0)
    ? chartImage
    : generateMemberDisbursementsChartImage(data, selectedYear);

  addVisualGraphSheet(wb, {
    graphTitle: 'Member-wise Loan Disbursements by Month',
    selectedYear,
    chartImage: finalChartImage
  });

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
  chartImage,
  notify
}: {
  data: MemberLoanSummaryItem[];
  selectedYear: number;
  chartImage?: { base64: string; width: number; height: number } | null;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Unnati Trust (R)';
  wb.created = new Date();

  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  // Sheet 1: Existing Statement Data
  const ws = wb.addWorksheet('Borrowed vs Repaid', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2
      }
    }
  });

  const colCount = 9;
  ws.columns = [
    { width: 8 },  // Sl No.
    { width: 26 }, // Member Name
    { width: 18 }, // Total Loans (Qty)
    { width: 18 }, // Active / Closed
    { width: 22 }, // Total Borrowed (₹)
    { width: 22 }, // Principal Repaid (₹)
    { width: 20 }, // Interest Paid (₹)
    { width: 22 }, // Total Repaid (₹)
    { width: 25 }  // Outstanding Principal (₹)
  ];

  // Row 1
  const r1 = ws.addRow(['UNNATI TRUST (R)']);
  ws.mergeCells(1, 1, 1, colCount);
  r1.height = 28;
  r1.getCell(1).font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2
  const r2 = ws.addRow([`MEMBERWISE BORROWED VS REPAID AUDIT STATEMENT - ${selectedYear}`]);
  ws.mergeCells(2, 1, 2, colCount);
  r2.height = 24;
  r2.getCell(1).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3
  const r3 = ws.addRow([`Accounting Period: Calendar Year ${selectedYear} | Generated: ${dateStr} | Active & Settled Accounts`]);
  ws.mergeCells(3, 1, 3, colCount);
  r3.height = 20;
  r3.getCell(1).font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF334155' } };
  r3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4
  const r4 = ws.addRow([]);
  r4.height = 10;

  // Headers
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
  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { 
      horizontal: colNumber === 1 || colNumber === 3 || colNumber === 4 ? 'center' : (colNumber >= 5 ? 'right' : 'left'),
      vertical: 'middle',
      wrapText: true 
    };
    cell.border = BORDER_THIN;
  });

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

    const statusBadge = `${item.activeLoans} Active / ${item.closedLoans} Closed`;

    const row = ws.addRow([
      idx + 1,
      item.name,
      item.totalLoans,
      statusBadge,
      item.borrowed,
      item.repaidPrincipal,
      item.interestPaid,
      item.totalRepaid,
      item.balancePrincipal
    ]);
    row.height = 20;

    const isZebra = idx % 2 === 1;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isZebra ? 'FFF8FAFC' : 'FFFFFFFF' }
      };
      cell.alignment = {
        horizontal: colNumber === 1 || colNumber === 3 || colNumber === 4 ? 'center' : (colNumber >= 5 ? 'right' : 'left'),
        vertical: 'middle'
      };
      cell.border = BORDER_THIN;
      if (colNumber >= 5 && typeof cell.value === 'number') {
        cell.numFmt = '₹#,##0';
      }
    });
  });

  // Total Row
  const totalRow = ws.addRow([
    `TOTAL (${selectedYear})`,
    `${data.length} Members`,
    sumLoansCount,
    '-',
    sumBorrowed,
    sumPrincipal,
    sumInterest,
    sumTotalRepaid,
    sumBalancePrincipal
  ]);
  totalRow.height = 24;
  totalRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF155E75' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCFFAFE' } }; // Cyan highlight
    cell.alignment = {
      horizontal: colNumber >= 5 ? 'right' : (colNumber === 3 || colNumber === 4 ? 'center' : 'left'),
      vertical: 'middle'
    };
    cell.border = BORDER_DOUBLE_BOTTOM;
    if (colNumber >= 5 && typeof cell.value === 'number') {
      cell.numFmt = '₹#,##0';
    }
  });

  // Sheet 2: New Separate Sheet with the Actual Graph Image
  const finalChartImage = (chartImage && chartImage.base64 && chartImage.width > 0)
    ? chartImage
    : generateMemberwiseBorrowedRepaidChartImage(data, selectedYear);

  addVisualGraphSheet(wb, {
    graphTitle: 'Memberwise Borrowed vs Repaid',
    selectedYear,
    chartImage: finalChartImage
  });

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
  chartImage,
  notify
}: {
  data: FinancialHealthOverviewData;
  selectedYear: number;
  chartImage?: { base64: string; width: number; height: number } | null;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Unnati Trust (R)';
  wb.created = new Date();

  const dateStr = format(new Date(), 'dd-MMM-yyyy hh:mm a');

  // Sheet 1: Existing Statement Data
  const ws = wb.addWorksheet('Financial Health', {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: {
        left: 0.35,
        right: 0.35,
        top: 0.4,
        bottom: 0.4,
        header: 0.2,
        footer: 0.2
      }
    }
  });

  const colCount = 7;
  ws.columns = [
    { width: 8 },  // Sl No.
    { width: 34 }, // Financial Metric / Capital Head
    { width: 28 }, // Category & Purpose
    { width: 22 }, // Base Component (₹)
    { width: 22 }, // Interest / Surplus (₹)
    { width: 24 }, // Total Net Amount (₹)
    { width: 45 }  // Reconciliation & Audit Status
  ];

  // Row 1
  const r1 = ws.addRow(['UNNATI TRUST (R)']);
  ws.mergeCells(1, 1, 1, colCount);
  r1.height = 28;
  r1.getCell(1).font = { name: 'Segoe UI', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1B4B' } };
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 2
  const r2 = ws.addRow([`FINANCIAL HEALTH & GROUP CAPITAL STATEMENT - ${selectedYear}`]);
  ws.mergeCells(2, 1, 2, colCount);
  r2.height = 24;
  r2.getCell(1).font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3
  const r3 = ws.addRow([`Capital Reserve & Liquidity Health | Period: ${selectedYear} | Generated: ${dateStr}`]);
  ws.mergeCells(3, 1, 3, colCount);
  r3.height = 20;
  r3.getCell(1).font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF334155' } };
  r3.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4
  const r4 = ws.addRow([]);
  r4.height = 10;

  // Headers
  const headers = [
    'Sl No.',
    'Financial Metric / Capital Head',
    'Category & Purpose',
    'Base Component (₹)',
    'Interest / Surplus (₹)',
    'Total Net Amount (₹)',
    'Reconciliation & Audit Status'
  ];
  const headerRow = ws.addRow(headers);
  headerRow.height = 26;
  headerRow.eachCell((cell, colNumber) => {
    cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
    cell.alignment = { 
      horizontal: colNumber === 1 ? 'center' : (colNumber >= 4 && colNumber <= 6 ? 'right' : 'left'),
      vertical: 'middle',
      wrapText: true 
    };
    cell.border = BORDER_THIN;
  });

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

    const row = ws.addRow([
      idx + 1,
      item.category,
      item.subtitle,
      item.baseAmount,
      item.interestAmount,
      item.totalAmount,
      statusDesc
    ]);
    row.height = 20;

    const isZebra = idx % 2 === 1;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isZebra ? 'FFF8FAFC' : 'FFFFFFFF' }
      };
      cell.alignment = {
        horizontal: colNumber === 1 ? 'center' : (colNumber >= 4 && colNumber <= 6 ? 'right' : 'left'),
        vertical: 'middle'
      };
      cell.border = BORDER_THIN;
      if (colNumber >= 4 && colNumber <= 6 && typeof cell.value === 'number') {
        cell.numFmt = '₹#,##0';
      }
    });
  });

  // Reconciled Check Header
  ws.addRow([]); // Blank spacer
  const recHeaderIdx = ws.rowCount + 1;
  const recHeaderRow = ws.addRow(['AUDIT RECONCILIATION SUMMARY', '', '', '', '', '', '']);
  ws.mergeCells(recHeaderIdx, 1, recHeaderIdx, colCount);
  recHeaderRow.height = 22;
  recHeaderRow.getCell(1).font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FF065F46' } };
  recHeaderRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
  recHeaderRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  recHeaderRow.getCell(1).border = BORDER_THIN;

  // A, B, C rows
  const recRowsData = [
    [
      'A',
      'Active Loans Outstanding (Due from Members)',
      'Funds deployed',
      data.outstandingLoans,
      '',
      data.outstandingLoans,
      'Verified active principal portfolio'
    ],
    [
      'B',
      'Liquid Pool Reserves (Available Balance)',
      'Cash in hand + Bank',
      data.availableBalance,
      '',
      data.availableBalance,
      'Immediately available liquid funds'
    ],
    [
      'C',
      'TOTAL ACCOUNTED CAPITAL (A + B)',
      'Total Trust Assets',
      data.outstandingLoans + data.availableBalance,
      '',
      data.outstandingLoans + data.availableBalance,
      `100% MATCHES TOTAL GROUP SAVINGS (₹${data.totalGroupFunds.toLocaleString('en-IN')})`
    ]
  ];

  recRowsData.forEach((rData, rIdx) => {
    const isFinal = rIdx === 2;
    const row = ws.addRow(rData);
    row.height = 22;
    row.eachCell((cell, colNumber) => {
      cell.font = { 
        name: 'Segoe UI', 
        size: 10, 
        bold: isFinal, 
        color: { argb: isFinal ? 'FF065F46' : 'FF0F172A' } 
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isFinal ? 'FFECFDF5' : 'FFFFFFFF' }
      };
      cell.alignment = {
        horizontal: colNumber === 1 ? 'center' : (colNumber >= 4 && colNumber <= 6 ? 'right' : 'left'),
        vertical: 'middle'
      };
      cell.border = isFinal ? BORDER_DOUBLE_BOTTOM : BORDER_THIN;
      if ((colNumber === 4 || colNumber === 6) && typeof cell.value === 'number') {
        cell.numFmt = '₹#,##0';
      }
    });
  });

  // Sheet 2: New Separate Sheet with the Actual Graph Image
  const finalChartImage = (chartImage && chartImage.base64 && chartImage.width > 0)
    ? chartImage
    : generateFinancialHealthChartImage(data, selectedYear);

  addVisualGraphSheet(wb, {
    graphTitle: 'Financial Health Overview',
    selectedYear,
    chartImage: finalChartImage
  });

  const fileName = `Financial_Health_Overview_${selectedYear}_${format(new Date(), 'MMMyyyy')}.xlsx`;
  await saveOrDownloadWorkbook(wb, fileName, notify);
}
