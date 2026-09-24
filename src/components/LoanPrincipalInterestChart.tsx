import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList
} from 'recharts';
import {
  Layers,
  PieChart,
  TrendingUp,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  IndianRupee,
  Calendar,
  AlertCircle,
  Percent,
  Banknote,
  ArrowUpRight,
  Wallet,
  Sparkles,
  BarChart2
} from 'lucide-react';
import { Loan, LoanPayment, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

interface LoanPrincipalInterestChartProps {
  loans: Loan[];
  loanPayments: LoanPayment[];
  allUsers: UserProfile[];
  selectedLoanId?: string | null;
  onSelectLoan?: (loanId: string) => void;
  className?: string;
}

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const LoanPrincipalInterestChart: React.FC<LoanPrincipalInterestChartProps> = ({
  loans,
  loanPayments,
  allUsers,
  selectedLoanId,
  onSelectLoan,
  className
}) => {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [chartMode, setChartMode] = useState<'bar' | 'area'>('bar');
  const [viewScope, setViewScope] = useState<'paid' | 'full'>('paid');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Filter only disbursed loans (approved or paid)
  const sanctionedLoans = useMemo(() => {
    return loans
      .filter(l => l.status === 'approved' || l.status === 'paid')
      .sort((a, b) => {
        const timeA = a.approvedAt?.toDate ? a.approvedAt.toDate().getTime() : (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
        const timeB = b.approvedAt?.toDate ? b.approvedAt.toDate().getTime() : (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
        return timeB - timeA;
      });
  }, [loans]);

  // Current active loan ID
  const effectiveSelectedLoanId = selectedLoanId !== undefined ? selectedLoanId : internalSelectedId;

  // Active loan object
  const activeLoan = useMemo(() => {
    if (sanctionedLoans.length === 0) return null;
    if (effectiveSelectedLoanId) {
      const found = sanctionedLoans.find(l => l.id === effectiveSelectedLoanId);
      if (found) return found;
    }
    return sanctionedLoans[0];
  }, [sanctionedLoans, effectiveSelectedLoanId]);

  const handleSelectLoan = (loanId: string) => {
    setInternalSelectedId(loanId);
    if (onSelectLoan) {
      onSelectLoan(loanId);
    }
  };

  // Find borrower profile
  const borrower = useMemo(() => {
    if (!activeLoan) return null;
    return allUsers.find(u => 
      (activeLoan.userId && u.uid === activeLoan.userId) || 
      (activeLoan.userEmail && u.email.toLowerCase() === activeLoan.userEmail.toLowerCase())
    );
  }, [activeLoan, allUsers]);

  // Get active loan index for prev/next buttons
  const activeIndex = useMemo(() => {
    if (!activeLoan) return -1;
    return sanctionedLoans.findIndex(l => l.id === activeLoan.id);
  }, [sanctionedLoans, activeLoan]);

  const handlePrevLoan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sanctionedLoans.length === 0) return;
    const prevIdx = activeIndex <= 0 ? sanctionedLoans.length - 1 : activeIndex - 1;
    handleSelectLoan(sanctionedLoans[prevIdx].id!);
  };

  const handleNextLoan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sanctionedLoans.length === 0) return;
    const nextIdx = activeIndex >= sanctionedLoans.length - 1 ? 0 : activeIndex + 1;
    handleSelectLoan(sanctionedLoans[nextIdx].id!);
  };

  // Filtered loans list for searchable selector dropdown
  const filteredDropdownLoans = useMemo(() => {
    if (!searchQuery.trim()) return sanctionedLoans;
    const q = searchQuery.toLowerCase().trim();
    return sanctionedLoans.filter(l => {
      const u = allUsers.find(user => 
        (l.userId && user.uid === l.userId) || 
        (l.userEmail && user.email.toLowerCase() === l.userEmail.toLowerCase())
      );
      const name = (u?.displayName || l.userEmail || '').toLowerCase();
      const email = (l.userEmail || '').toLowerCase();
      const amountStr = (l.approvedAmount || l.amount || '').toString();
      const statusStr = (l.status || '').toLowerCase();
      return name.includes(q) || email.includes(q) || amountStr.includes(q) || statusStr.includes(q);
    });
  }, [sanctionedLoans, allUsers, searchQuery]);

  // Loan sanction date helper
  const getSanctionDate = (loan: Loan): Date => {
    if (loan.approvedAt?.toDate) return loan.approvedAt.toDate();
    if (loan.approvedAt?.seconds) return new Date(loan.approvedAt.seconds * 1000);
    if (loan.approvedAt instanceof Date) return loan.approvedAt;
    if (typeof loan.approvedAt === 'string') {
      const d = new Date(loan.approvedAt);
      if (!isNaN(d.getTime())) return d;
    }
    if (loan.createdAt?.toDate) return loan.createdAt.toDate();
    if (loan.createdAt?.seconds) return new Date(loan.createdAt.seconds * 1000);
    if (loan.createdAt instanceof Date) return loan.createdAt;
    if (typeof loan.createdAt === 'string') {
      const d = new Date(loan.createdAt);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  };

  // Process payments & trajectory data for active loan
  const { chartData, stats, hasPayments } = useMemo(() => {
    if (!activeLoan) {
      return {
        chartData: [],
        stats: {
          approvedAmount: 0,
          totalPrincipalPaid: 0,
          totalInterestPaid: 0,
          totalPaid: 0,
          remainingPrincipal: 0,
          paidInstallmentsCount: 0,
          totalInstallments: 10,
          repaymentProgress: 0,
          settledDateStr: '-'
        },
        hasPayments: false
      };
    }

    const loanPrincipal = activeLoan.approvedAmount || activeLoan.amount || 0;
    const installments = activeLoan.installments || 10;
    const sanctionDate = getSanctionDate(activeLoan);

    // Filter all payments belonging to this loan
    const rawPayments = loanPayments.filter(p => 
      (activeLoan.id && p.loanId === activeLoan.id) || 
      (!p.loanId && activeLoan.userId && p.userId === activeLoan.userId)
    );

    // Sort chronologically
    const sortedPaidPayments = rawPayments
      .filter(p => p.status === 'paid')
      .sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : ((a.year || 0) * 100 + (a.month || 0));
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : ((b.year || 0) * 100 + (b.month || 0));
        return timeA - timeB;
      });

    const totalPrincipalPaid = sortedPaidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalInterestPaid = sortedPaidPayments.reduce((sum, p) => sum + (p.interest || 0), 0);
    const totalPaid = totalPrincipalPaid + totalInterestPaid;
    const remainingPrincipal = Math.max(0, loanPrincipal - totalPrincipalPaid);
    const repaymentProgress = loanPrincipal > 0 ? Math.min(100, Math.round((totalPrincipalPaid / loanPrincipal) * 100)) : 0;

    let settledDateStr = '-';
    if (activeLoan.status === 'paid' || remainingPrincipal <= 0) {
      if (sortedPaidPayments.length > 0) {
        const last = sortedPaidPayments[sortedPaidPayments.length - 1];
        if (last.timestamp?.toDate) {
          settledDateStr = format(last.timestamp.toDate(), 'dd MMM yyyy');
        } else {
          settledDateStr = `${MONTH_NAMES[last.month] || last.month} ${last.year}`;
        }
      } else {
        settledDateStr = 'Settled';
      }
    }

    const paidCount = sortedPaidPayments.length;
    const hasAnyPayments = paidCount > 0;

    // Decide if we should render 'paid' only or 'full' timeline
    // If scope is 'paid' but there are no paid payments, fall back to showing projected full timeline
    const effectiveScope = (viewScope === 'paid' && hasAnyPayments) ? 'paid' : 'full';

    type ChartPoint = {
      periodLabel: string;
      shortLabel: string;
      installmentNumber: number;
      principal: number;
      interest: number;
      total: number;
      cumulativePrincipal: number;
      cumulativeInterest: number;
      cumulativeTotal: number;
      remainingPrincipal: number;
      status: 'paid' | 'pending' | 'projected';
      paymentMode?: string;
      dateStr: string;
      isSettled: boolean;
    };

    const points: ChartPoint[] = [];

    if (effectiveScope === 'paid') {
      // Build point for each paid payment
      let runPrincipal = 0;
      let runInterest = 0;

      sortedPaidPayments.forEach((p, idx) => {
        const pPrincipal = p.amount || 0;
        const pInterest = p.interest || 0;
        const pTotal = pPrincipal + pInterest;

        runPrincipal += pPrincipal;
        runInterest += pInterest;

        const currentRem = Math.max(0, loanPrincipal - runPrincipal);

        const mName = MONTH_NAMES[p.month] || `M${p.month}`;
        const pYear = p.year || sanctionDate.getFullYear();
        const periodLabel = `${mName} ${pYear}`;
        const shortLabel = `${mName} '${String(pYear).slice(-2)}`;

        let dateStr = `${mName} ${pYear}`;
        if (p.timestamp?.toDate) {
          dateStr = format(p.timestamp.toDate(), 'dd MMM yyyy');
        }

        points.push({
          periodLabel,
          shortLabel: `#${idx + 1} (${shortLabel})`,
          installmentNumber: idx + 1,
          principal: pPrincipal,
          interest: pInterest,
          total: pTotal,
          cumulativePrincipal: runPrincipal,
          cumulativeInterest: runInterest,
          cumulativeTotal: runPrincipal + runInterest,
          remainingPrincipal: currentRem,
          status: 'paid',
          paymentMode: p.paymentMethod || p.paymentMode || 'Online',
          dateStr,
          isSettled: currentRem <= 0 || (idx === sortedPaidPayments.length - 1 && activeLoan.status === 'paid')
        });
      });
    } else {
      // Full loan tenure timeline (including paid + upcoming scheduled installments)
      let runPrincipal = 0;
      let runInterest = 0;
      const scheduledPrincipalPerMonth = Math.round(loanPrincipal / installments);

      for (let i = 0; i < installments; i++) {
        const instDate = new Date(sanctionDate.getFullYear(), sanctionDate.getMonth() + i + 1, 1);
        const instMonth = instDate.getMonth() + 1;
        const instYear = instDate.getFullYear();
        const mName = MONTH_NAMES[instMonth] || `M${instMonth}`;
        const shortLabel = `${mName} '${String(instYear).slice(-2)}`;
        const periodLabel = `${mName} ${instYear}`;

        // Check if an actual payment matches this month & year
        const matchPayment = sortedPaidPayments.find(p => p.month === instMonth && p.year === instYear);
        const pendingPayment = rawPayments.find(p => p.month === instMonth && p.year === instYear && p.status === 'pending');

        if (matchPayment) {
          const pPrincipal = matchPayment.amount || 0;
          const pInterest = matchPayment.interest || 0;
          runPrincipal += pPrincipal;
          runInterest += pInterest;
          const curRem = Math.max(0, loanPrincipal - runPrincipal);

          let dateStr = `${mName} ${instYear}`;
          if (matchPayment.timestamp?.toDate) {
            dateStr = format(matchPayment.timestamp.toDate(), 'dd MMM yyyy');
          }

          points.push({
            periodLabel,
            shortLabel: `#${i + 1} ${shortLabel}`,
            installmentNumber: i + 1,
            principal: pPrincipal,
            interest: pInterest,
            total: pPrincipal + pInterest,
            cumulativePrincipal: runPrincipal,
            cumulativeInterest: runInterest,
            cumulativeTotal: runPrincipal + runInterest,
            remainingPrincipal: curRem,
            status: 'paid',
            paymentMode: matchPayment.paymentMethod || matchPayment.paymentMode || 'Online',
            dateStr,
            isSettled: curRem <= 0 || activeLoan.status === 'paid'
          });
        } else if (pendingPayment) {
          const pPrincipal = pendingPayment.amount || 0;
          const pInterest = pendingPayment.interest || 0;
          runPrincipal += pPrincipal;
          runInterest += pInterest;
          const curRem = Math.max(0, loanPrincipal - runPrincipal);

          points.push({
            periodLabel,
            shortLabel: `#${i + 1} ${shortLabel}`,
            installmentNumber: i + 1,
            principal: pPrincipal,
            interest: pInterest,
            total: pPrincipal + pInterest,
            cumulativePrincipal: runPrincipal,
            cumulativeInterest: runInterest,
            cumulativeTotal: runPrincipal + runInterest,
            remainingPrincipal: curRem,
            status: 'pending',
            paymentMode: pendingPayment.paymentMethod || pendingPayment.paymentMode || 'Pending',
            dateStr: 'Awaiting Approval',
            isSettled: false
          });
        } else {
          // If already settled, stop adding projected installments after settlement
          if (activeLoan.status === 'paid' && runPrincipal >= loanPrincipal) {
            break;
          }

          // Planned reducing interest calculation (0.5% per month)
          const plannedRemaining = Math.max(0, loanPrincipal - runPrincipal);
          const pPrincipal = Math.min(plannedRemaining, scheduledPrincipalPerMonth);
          const pInterest = Math.round(plannedRemaining * 0.005);

          runPrincipal += pPrincipal;
          runInterest += pInterest;
          const curRem = Math.max(0, plannedRemaining - pPrincipal);

          points.push({
            periodLabel,
            shortLabel: `#${i + 1} ${shortLabel}`,
            installmentNumber: i + 1,
            principal: pPrincipal,
            interest: pInterest,
            total: pPrincipal + pInterest,
            cumulativePrincipal: runPrincipal,
            cumulativeInterest: runInterest,
            cumulativeTotal: runPrincipal + runInterest,
            remainingPrincipal: curRem,
            status: 'projected',
            dateStr: `Due 10th ${periodLabel}`,
            isSettled: false
          });
        }
      }
    }

    return {
      chartData: points,
      stats: {
        approvedAmount: loanPrincipal,
        totalPrincipalPaid,
        totalInterestPaid,
        totalPaid,
        remainingPrincipal,
        paidInstallmentsCount: paidCount,
        totalInstallments: installments,
        repaymentProgress,
        settledDateStr
      },
      hasPayments: hasAnyPayments
    };
  }, [activeLoan, loanPayments, viewScope]);

  // Custom Rich Tooltip for Recharts
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const principal = data.principal || 0;
      const interest = data.interest || 0;
      const total = principal + interest;
      const principalPct = total > 0 ? Math.round((principal / total) * 100) : 0;
      const interestPct = total > 0 ? (100 - principalPct) : 0;

      return (
        <div className="bg-slate-900/95 backdrop-blur-md text-white px-4 py-3 rounded-2xl shadow-2xl border border-slate-700/80 text-xs min-w-[210px] select-none z-50">
          <div className="flex items-center justify-between gap-3 mb-2.5 border-b border-slate-800 pb-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="font-bold text-slate-100 text-sm">{data.periodLabel}</span>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-[10px] font-bold border",
              data.status === 'paid' && "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
              data.status === 'pending' && "bg-amber-500/20 text-amber-300 border-amber-500/30",
              data.status === 'projected' && "bg-slate-800 text-slate-300 border-slate-700"
            )}>
              {data.status === 'paid' ? 'Paid' : data.status === 'pending' ? 'Pending' : 'Projected'}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                <span className="text-slate-300">Principal Paid:</span>
              </div>
              <div className="text-right">
                <span className="font-black text-emerald-300 text-xs">
                  ₹{principal.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400 ml-1 font-medium">({principalPct}%)</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-indigo-400" />
                <span className="text-slate-300">Interest Paid:</span>
              </div>
              <div className="text-right">
                <span className="font-black text-indigo-300 text-xs">
                  ₹{interest.toLocaleString('en-IN')}
                </span>
                <span className="text-[10px] text-slate-400 ml-1 font-medium">({interestPct}%)</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
              <span className="text-slate-400 font-semibold">Total Installment:</span>
              <span className="font-black text-white text-sm">
                ₹{total.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-400">Balance Remaining:</span>
              <span className={cn(
                "font-bold",
                data.remainingPrincipal > 0 ? "text-amber-300" : "text-emerald-400"
              )}>
                {data.remainingPrincipal > 0 ? `₹${data.remainingPrincipal.toLocaleString('en-IN')}` : 'Settled'}
              </span>
            </div>

            {chartMode === 'area' && (
              <div className="pt-1.5 border-t border-slate-800/60 text-[10.5px] space-y-1 text-slate-400">
                <div className="flex justify-between">
                  <span>Cumul. Principal:</span>
                  <span className="text-emerald-300 font-bold">₹{data.cumulativePrincipal.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cumul. Interest:</span>
                  <span className="text-indigo-300 font-bold">₹{data.cumulativeInterest.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            {data.dateStr && (
              <div className="pt-1 text-[10px] text-slate-400 border-t border-slate-800/60 flex items-center justify-between">
                <span>Date:</span>
                <span className="font-medium text-slate-300">{data.dateStr}</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  if (!activeLoan) {
    return (
      <div className={cn("bg-white p-8 rounded-3xl border border-slate-200 text-center shadow-xs", className)}>
        <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-slate-700">No Disbursed Loans Available</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Once loans are approved and issued to members, their Principal vs. Interest repayment breakdown will appear here.
        </p>
      </div>
    );
  }

  const borrowerName = borrower?.displayName || (activeLoan as any).userName || activeLoan.userEmail?.split('@')[0] || 'Member';
  const borrowerInitial = borrowerName.charAt(0).toUpperCase();
  const isLoanSettled = activeLoan.status === 'paid' || stats.remainingPrincipal <= 0;

  // Loan disbursement date
  const disbursementDate = useMemo(() => {
    if (!activeLoan) return null;
    return getSanctionDate(activeLoan);
  }, [activeLoan]);

  const disbursementDateStr = useMemo(() => {
    if (!disbursementDate) return '-';
    return format(disbursementDate, 'dd MMM yyyy');
  }, [disbursementDate]);

  // Next Month Installment calculation for active loans
  const nextInstallmentInfo = useMemo(() => {
    if (!activeLoan || isLoanSettled) return null;

    const loanPrincipal = activeLoan.approvedAmount || activeLoan.amount || 0;
    const installments = activeLoan.installments || 10;
    const sanctionDate = getSanctionDate(activeLoan);

    const rawPayments = loanPayments.filter(p => 
      (activeLoan.id && p.loanId === activeLoan.id) || 
      (!p.loanId && activeLoan.userId && p.userId === activeLoan.userId)
    );

    const sortedPaidPayments = rawPayments.filter(p => p.status === 'paid');
    const totalPrincipalPaid = sortedPaidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingPrincipal = Math.max(0, loanPrincipal - totalPrincipalPaid);

    if (remainingPrincipal <= 0) return null;

    const scheduledPrincipalPerMonth = Math.round(loanPrincipal / installments);

    // Scan installments starting from the month after disbursement
    for (let i = 0; i < installments; i++) {
      const instDate = new Date(sanctionDate.getFullYear(), sanctionDate.getMonth() + i + 1, 1);
      const instMonth = instDate.getMonth() + 1;
      const instYear = instDate.getFullYear();

      const isPaid = sortedPaidPayments.some(p => p.month === instMonth && p.year === instYear);
      if (isPaid) continue;

      const pendingPayment = rawPayments.find(p => p.month === instMonth && p.year === instYear && p.status === 'pending');
      if (pendingPayment) {
        const principal = pendingPayment.amount || scheduledPrincipalPerMonth;
        const interest = pendingPayment.interest || Math.round(remainingPrincipal * 0.005);
        return {
          installmentNumber: i + 1,
          month: instMonth,
          year: instYear,
          periodLabel: `${MONTH_NAMES[instMonth] || instMonth} ${instYear}`,
          principal,
          interest,
          total: principal + interest,
          isPending: true
        };
      }

      // First scheduled unpaid installment
      const principal = Math.min(remainingPrincipal, scheduledPrincipalPerMonth);
      const interest = Math.round(remainingPrincipal * 0.005);
      return {
        installmentNumber: i + 1,
        month: instMonth,
        year: instYear,
        periodLabel: `${MONTH_NAMES[instMonth] || instMonth} ${instYear}`,
        principal,
        interest,
        total: principal + interest,
        isPending: false
      };
    }

    // Fallback if all standard tenure slots passed but principal remains
    const principal = Math.min(remainingPrincipal, scheduledPrincipalPerMonth);
    const interest = Math.round(remainingPrincipal * 0.005);
    return {
      installmentNumber: sortedPaidPayments.length + 1,
      month: 0,
      year: 0,
      periodLabel: 'Upcoming',
      principal,
      interest,
      total: principal + interest,
      isPending: false
    };
  }, [activeLoan, isLoanSettled, loanPayments]);

  return (
    <div className={cn(
      "bg-gradient-to-b from-purple-50/40 via-white to-white rounded-3xl border-2 border-purple-200/90 shadow-sm p-4 sm:p-6 transition-all relative overflow-visible",
      className
    )}>
      {/* Top Header & Interactive Loan Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-purple-100/80">
        {/* Title & Context */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <BarChart2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-black text-slate-900 text-sm sm:text-base tracking-tight">
                Principal vs. Interest Breakdown
              </h4>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border",
                isLoanSettled 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-300" 
                  : "bg-purple-100/80 text-purple-700 border-purple-300/80"
              )}>
                {isLoanSettled ? 'Settled Loan' : 'Active Loan'}
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Repayment timeline for <span className="text-purple-700 font-bold">{borrowerName}</span> • ₹{stats.approvedAmount.toLocaleString('en-IN')} Loan • Disbursed: <span className="font-bold text-slate-800">{disbursementDateStr}</span>
            </p>
          </div>
        </div>

        {/* Loan Switcher Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Previous / Next buttons */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={handlePrevLoan}
              className="p-2 hover:bg-purple-50 text-slate-500 hover:text-purple-600 transition-colors border-r border-slate-200/90 disabled:opacity-40 cursor-pointer"
              title="Previous Loan"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 text-[11px] font-bold text-slate-600 select-none">
              {activeIndex + 1} / {sanctionedLoans.length}
            </span>
            <button
              type="button"
              onClick={handleNextLoan}
              className="p-2 hover:bg-purple-50 text-slate-500 hover:text-purple-600 transition-colors disabled:opacity-40 cursor-pointer"
              title="Next Loan"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Searchable Loan Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-2 bg-white hover:bg-purple-50/50 border border-purple-200 rounded-xl shadow-2xs transition-all text-left text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                {borrowerInitial}
              </div>
              <div className="min-w-0 max-w-[140px] sm:max-w-[190px]">
                <p className="truncate font-bold text-slate-900 leading-tight">
                  {borrowerName}
                </p>
                <p className="truncate text-[10px] text-purple-600 font-bold">
                  ₹{stats.approvedAmount.toLocaleString('en-IN')}
                </p>
              </div>
              <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsDropdownOpen(false)} 
                />
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search borrower or loan amount..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 py-1">
                    {filteredDropdownLoans.length === 0 ? (
                      <p className="text-center py-4 text-xs text-slate-400">No matching loans found</p>
                    ) : (
                      filteredDropdownLoans.map((l) => {
                        const isSelected = l.id === activeLoan.id;
                        const u = allUsers.find(user => 
                          (l.userId && user.uid === l.userId) || 
                          (l.userEmail && user.email.toLowerCase() === l.userEmail.toLowerCase())
                        );
                        const name = u?.displayName || (l as any).userName || l.userEmail?.split('@')[0] || 'Member';
                        const isPaid = l.status === 'paid';

                        return (
                          <button
                            key={`dropdown-loan-${l.id}`}
                            type="button"
                            onClick={() => {
                              handleSelectLoan(l.id!);
                              setIsDropdownOpen(false);
                              setSearchQuery('');
                            }}
                            className={cn(
                              "w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer",
                              isSelected ? "bg-purple-50 text-purple-900 font-bold" : "hover:bg-slate-50 text-slate-700"
                            )}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className={cn(
                                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                                isSelected ? "bg-purple-600 text-white" : "bg-slate-100 text-slate-600"
                              )}>
                                {name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs leading-tight font-bold">{name}</p>
                                <p className="truncate text-[10px] text-slate-400 font-normal">
                                  ₹{(l.approvedAmount || l.amount || 0).toLocaleString('en-IN')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase",
                                isPaid ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                              )}>
                                {isPaid ? 'Settled' : 'Active'}
                              </span>
                              {isSelected && (
                                <CheckCircle2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Collapse/Expand toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title={isCollapsed ? "Expand Chart" : "Collapse Chart"}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isCollapsed && "-rotate-90")} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="pt-4 space-y-4">
          {/* KPI Stat Cards for the Selected Loan */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-2.5">
            {/* Card 1: Principal Repaid */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <Banknote className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="truncate">Principal Paid</span>
                  </div>
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md shrink-0">
                    {stats.repaymentProgress}%
                  </span>
                </div>
                <p className="text-base xl:text-lg font-black text-emerald-700 truncate">
                  ₹{stats.totalPrincipalPaid.toLocaleString('en-IN')}
                </p>
                <div className="w-full bg-slate-100 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${stats.repaymentProgress}%` }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                of ₹{stats.approvedAmount.toLocaleString('en-IN')} Disbursed
              </p>
            </div>

            {/* Card 2: Interest Paid */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <Percent className="w-3 h-3 text-indigo-500 shrink-0" />
                    <span className="truncate">Interest Paid</span>
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-md shrink-0">
                    0.5% / Mo
                  </span>
                </div>
                <p className="text-base xl:text-lg font-black text-indigo-600 truncate">
                  ₹{stats.totalInterestPaid.toLocaleString('en-IN')}
                </p>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                Cumulative Interest Income
              </p>
            </div>

            {/* Card 3: Total Repaid (Principal + Interest) */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <TrendingUp className="w-3 h-3 text-purple-600 shrink-0" />
                    <span className="truncate">Total Repaid</span>
                  </div>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded-md shrink-0">
                    {stats.paidInstallmentsCount} / {stats.totalInstallments} Inst.
                  </span>
                </div>
                <p className="text-base xl:text-lg font-black text-purple-700 truncate">
                  ₹{stats.totalPaid.toLocaleString('en-IN')}
                </p>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                Total Cash Flow Received
              </p>
            </div>

            {/* Card 4: Next Month Installment (Active Loans) */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-blue-200/90 shadow-2xs flex flex-col justify-between bg-gradient-to-b from-blue-50/20 to-white">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                    <Calendar className="w-3 h-3 text-blue-600 shrink-0" />
                    <span className="truncate">Next Installment</span>
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0",
                    isLoanSettled 
                      ? "text-emerald-700 bg-emerald-50 border border-emerald-200/60" 
                      : nextInstallmentInfo?.isPending 
                        ? "text-amber-700 bg-amber-50 border border-amber-200/60" 
                        : "text-blue-700 bg-blue-50 border border-blue-200/60"
                  )}>
                    {isLoanSettled ? 'Settled' : nextInstallmentInfo ? `#${nextInstallmentInfo.installmentNumber}` : 'Due'}
                  </span>
                </div>
                <p className={cn(
                  "text-base xl:text-lg font-black truncate",
                  isLoanSettled ? "text-emerald-600" : "text-blue-600"
                )}>
                  {isLoanSettled 
                    ? '₹0' 
                    : nextInstallmentInfo 
                      ? `₹${nextInstallmentInfo.total.toLocaleString('en-IN')}` 
                      : '₹0'}
                </p>
              </div>
              <p className="text-[10px] text-slate-500 font-medium mt-1 truncate" title={
                isLoanSettled 
                  ? 'No Upcoming Dues' 
                  : nextInstallmentInfo 
                    ? `P: ₹${nextInstallmentInfo.principal.toLocaleString('en-IN')} + I: ₹${nextInstallmentInfo.interest.toLocaleString('en-IN')} (${nextInstallmentInfo.periodLabel})`
                    : 'Tenure Complete'
              }>
                {isLoanSettled 
                  ? 'No Upcoming Dues' 
                  : nextInstallmentInfo 
                    ? `P: ₹${nextInstallmentInfo.principal.toLocaleString('en-IN')} + I: ₹${nextInstallmentInfo.interest.toLocaleString('en-IN')} (${nextInstallmentInfo.periodLabel})`
                    : 'Tenure Complete'}
              </p>
            </div>

            {/* Card 5: Outstanding Principal / Settlement */}
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1 lg:col-span-1">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    {isLoanSettled ? (
                      <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3 h-3 text-amber-500 shrink-0" />
                    )}
                    <span className="truncate">Outstanding Balance</span>
                  </div>
                </div>
                <p className={cn(
                  "text-base xl:text-lg font-black truncate",
                  stats.remainingPrincipal > 0 ? "text-amber-600" : "text-emerald-600"
                )}>
                  {stats.remainingPrincipal > 0 ? `₹${stats.remainingPrincipal.toLocaleString('en-IN')}` : '₹0 (Settled)'}
                </p>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">
                {isLoanSettled ? `Closed on ${stats.settledDateStr}` : 'Principal Balance Remaining'}
              </p>
            </div>
          </div>

          {/* Chart View Toolbar: Chart Type & Timeline Scope */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 px-1">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                <span className="text-xs font-bold text-slate-800">
                  Repayment Trajectory (Principal vs. Interest)
                </span>
              </div>

              {/* Controls: Mode & Scope */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Scope Toggle: Paid vs Full Schedule */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 text-xs">
                  <button
                    type="button"
                    onClick={() => setViewScope('paid')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer",
                      viewScope === 'paid'
                        ? "bg-white text-purple-700 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Paid Payments ({stats.paidInstallmentsCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewScope('full')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer",
                      viewScope === 'full'
                        ? "bg-white text-purple-700 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Full Tenure ({stats.totalInstallments}M)
                  </button>
                </div>

                {/* Chart Type Toggle: Stacked Bar vs Cumulative Area */}
                <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200/80 text-xs">
                  <button
                    type="button"
                    onClick={() => setChartMode('bar')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer",
                      chartMode === 'bar'
                        ? "bg-white text-indigo-700 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Stacked Bar
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMode('area')}
                    className={cn(
                      "px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer",
                      chartMode === 'area'
                        ? "bg-white text-indigo-700 shadow-2xs"
                        : "text-slate-500 hover:text-slate-800"
                    )}
                  >
                    Cumulative Area
                  </button>
                </div>
              </div>
            </div>

            {/* Visual Legend */}
            <div className="flex items-center justify-between px-1 text-xs border-t border-slate-100 pt-2 flex-wrap gap-2">
              <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-emerald-500 shadow-2xs" />
                  <span className="text-[11px] text-slate-700 font-bold">Principal Paid</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-sm bg-indigo-500 shadow-2xs" />
                  <span className="text-[11px] text-slate-700 font-bold">Interest Paid (0.5%)</span>
                </div>
                {viewScope === 'full' && (
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 rounded-sm bg-slate-300 shadow-2xs" />
                    <span className="text-[11px] text-slate-500 font-medium">Projected Installments</span>
                  </div>
                )}
              </div>

              <div className="text-[11px] text-slate-400 font-medium">
                {chartData.length} data point{chartData.length !== 1 ? 's' : ''} on timeline
              </div>
            </div>

            {/* Recharts Canvas */}
            <div className="w-full h-[280px] sm:h-[330px] pt-2">
              {chartData.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs">
                  <Clock className="w-8 h-8 text-slate-300 mb-2" />
                  <p className="font-semibold">No payment records found for this loan yet.</p>
                  <button 
                    onClick={() => setViewScope('full')}
                    className="mt-2 text-purple-600 font-bold hover:underline cursor-pointer"
                  >
                    Switch to Full Tenure Schedule
                  </button>
                </div>
              ) : chartMode === 'bar' ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 22, right: 12, left: -10, bottom: 24 }}
                  >
                    <defs>
                      <linearGradient id="loanPrincipalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                        <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                      </linearGradient>
                      <linearGradient id="loanInterestGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.9} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      dy={8}
                      interval={0}
                      angle={chartData.length > 7 ? -25 : 0}
                      textAnchor={chartData.length > 7 ? "end" : "middle"}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `₹${val >= 1000 ? `${val / 1000}k` : val}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {/* Stacked Bars: Principal at base, Interest on top */}
                    <Bar
                      dataKey="principal"
                      name="Principal"
                      stackId="loanEmi"
                      fill="url(#loanPrincipalGradient)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="interest"
                      name="Interest"
                      stackId="loanEmi"
                      fill="url(#loanInterestGradient)"
                      radius={[6, 6, 0, 0]}
                    >
                      <LabelList
                        dataKey="total"
                        position="top"
                        formatter={(val: any) => typeof val === 'number' && val > 0 ? `₹${val >= 1000 ? `${Math.round(val / 1000)}k` : val}` : ''}
                        style={{ fontSize: '10px', fill: '#475569', fontWeight: 700 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 22, right: 12, left: -10, bottom: 24 }}
                  >
                    <defs>
                      <linearGradient id="areaPrincipalGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="areaInterestGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="shortLabel"
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      dy={8}
                      interval={0}
                      angle={chartData.length > 7 ? -25 : 0}
                      textAnchor={chartData.length > 7 ? "end" : "middle"}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={10}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `₹${val >= 1000 ? `${val / 1000}k` : val}`}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="cumulativePrincipal"
                      name="Cumulative Principal"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#areaPrincipalGradient)"
                    />
                    <Area
                      type="monotone"
                      dataKey="cumulativeInterest"
                      name="Cumulative Interest"
                      stroke="#6366f1"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#areaInterestGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
