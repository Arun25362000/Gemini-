import React, { useMemo, useState } from 'react';
import {
  Layers,
  PieChart,
  TrendingUp,
  CheckCircle2,
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

interface BorrowerLoanGroup {
  key: string;
  userId?: string;
  userEmail?: string;
  borrowerName: string;
  borrowerUser: UserProfile | null;
  loans: Loan[];
  activeLoans: Loan[];
  primaryLoanId: string;
  latestSanctionDate: Date;
  isAllSettled: boolean;
}

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
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Helper to extract loan sanction/approval date
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

  // Group sanctioned loans by borrower so members with multiple active loans (like Shwetha) appear clubbed as one entry
  const borrowerGroups = useMemo<BorrowerLoanGroup[]>(() => {
    if (sanctionedLoans.length === 0) return [];

    const groups: BorrowerLoanGroup[] = [];

    for (const loan of sanctionedLoans) {
      // Find matching user profile
      const user = allUsers.find(u => 
        (loan.userId && (u.uid === loan.userId || u.id === loan.userId)) ||
        (loan.userEmail && u.email && u.email.toLowerCase().trim() === loan.userEmail.toLowerCase().trim()) ||
        ((loan as any).userName && u.displayName && u.displayName.toLowerCase().trim() === ((loan as any).userName as string).toLowerCase().trim())
      );

      const resolvedName = (
        user?.displayName || 
        (user as any)?.name || 
        (loan as any).userName || 
        (loan.userEmail ? loan.userEmail.split('@')[0] : '') || 
        'Member'
      ).trim();

      const resolvedEmail = (user?.email || loan.userEmail || '').trim().toLowerCase();
      const resolvedUserId = user?.uid || user?.id || loan.userId || '';
      const normName = resolvedName.toLowerCase();

      // Check if an existing group belongs to this same borrower (by userId, email, or normalized name)
      const existingGroup = groups.find(g => {
        if (resolvedUserId && g.userId && g.userId === resolvedUserId) return true;
        if (resolvedEmail && g.userEmail && g.userEmail.toLowerCase().trim() === resolvedEmail) return true;
        if (normName && g.borrowerName.toLowerCase().trim() === normName) return true;
        return false;
      });

      const sanctionDate = getSanctionDate(loan);

      if (existingGroup) {
        existingGroup.loans.push(loan);
        if (loan.status === 'approved') {
          existingGroup.activeLoans.push(loan);
        }
        if (!existingGroup.borrowerUser && user) {
          existingGroup.borrowerUser = user;
        }
        if (!existingGroup.userEmail && resolvedEmail) {
          existingGroup.userEmail = resolvedEmail;
        }
        if (!existingGroup.userId && resolvedUserId) {
          existingGroup.userId = resolvedUserId;
        }
        if (sanctionDate.getTime() > existingGroup.latestSanctionDate.getTime()) {
          existingGroup.latestSanctionDate = sanctionDate;
          existingGroup.primaryLoanId = loan.id!;
        }
        existingGroup.isAllSettled = existingGroup.activeLoans.length === 0 && existingGroup.loans.every(l => l.status === 'paid');
      } else {
        const activeLoans = loan.status === 'approved' ? [loan] : [];
        const isAllSettled = activeLoans.length === 0 && loan.status === 'paid';
        const groupKey = resolvedUserId || resolvedEmail || normName || loan.id || 'unknown';

        groups.push({
          key: groupKey,
          userId: resolvedUserId || undefined,
          userEmail: resolvedEmail || undefined,
          borrowerName: resolvedName,
          borrowerUser: user || null,
          loans: [loan],
          activeLoans,
          primaryLoanId: loan.id!,
          latestSanctionDate: sanctionDate,
          isAllSettled
        });
      }
    }

    // Sort loans inside each group by sanction date descending
    for (const g of groups) {
      g.loans.sort((a, b) => {
        const timeA = a.approvedAt?.toDate ? a.approvedAt.toDate().getTime() : (a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0);
        const timeB = b.approvedAt?.toDate ? b.approvedAt.toDate().getTime() : (b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0);
        return timeB - timeA;
      });
    }

    // Sort groups: Borrowers with active loans first, then newest sanction date
    groups.sort((a, b) => {
      if (!a.isAllSettled && b.isAllSettled) return -1;
      if (a.isAllSettled && !b.isAllSettled) return 1;
      return b.latestSanctionDate.getTime() - a.latestSanctionDate.getTime();
    });

    return groups;
  }, [sanctionedLoans, allUsers]);

  // Current active loan ID from props or state
  const effectiveSelectedLoanId = selectedLoanId !== undefined ? selectedLoanId : internalSelectedId;

  // Active borrower group object
  const activeGroup = useMemo<BorrowerLoanGroup | null>(() => {
    if (borrowerGroups.length === 0) return null;
    if (effectiveSelectedLoanId) {
      const foundByLoan = borrowerGroups.find(g => g.loans.some(l => l.id === effectiveSelectedLoanId));
      if (foundByLoan) return foundByLoan;

      const foundByUser = borrowerGroups.find(g => 
        (g.userId && g.userId === effectiveSelectedLoanId) ||
        (g.userEmail && g.userEmail.toLowerCase().trim() === effectiveSelectedLoanId.toLowerCase().trim()) ||
        g.key === effectiveSelectedLoanId
      );
      if (foundByUser) return foundByUser;
    }
    return borrowerGroups[0];
  }, [borrowerGroups, effectiveSelectedLoanId]);

  const handleSelectGroup = (group: BorrowerLoanGroup) => {
    setInternalSelectedId(group.primaryLoanId);
    if (onSelectLoan) {
      onSelectLoan(group.primaryLoanId);
    }
  };

  // Get active group index for prev/next buttons
  const activeIndex = useMemo(() => {
    if (!activeGroup) return -1;
    return borrowerGroups.findIndex(g => g.key === activeGroup.key);
  }, [borrowerGroups, activeGroup]);

  const handlePrevGroup = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (borrowerGroups.length === 0) return;
    const prevIdx = activeIndex <= 0 ? borrowerGroups.length - 1 : activeIndex - 1;
    handleSelectGroup(borrowerGroups[prevIdx]);
  };

  const handleNextGroup = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (borrowerGroups.length === 0) return;
    const nextIdx = activeIndex >= borrowerGroups.length - 1 ? 0 : activeIndex + 1;
    handleSelectGroup(borrowerGroups[nextIdx]);
  };

  // Filtered borrower groups list for searchable selector dropdown
  const filteredDropdownGroups = useMemo(() => {
    if (!searchQuery.trim()) return borrowerGroups;
    const q = searchQuery.toLowerCase().trim();
    return borrowerGroups.filter(g => {
      const name = g.borrowerName.toLowerCase();
      const email = (g.userEmail || '').toLowerCase();
      const totalAmt = g.loans.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0).toString();
      const anyLoanMatches = g.loans.some(l => (l.approvedAmount || l.amount || '').toString().includes(q));
      return name.includes(q) || email.includes(q) || totalAmt.includes(q) || anyLoanMatches;
    });
  }, [borrowerGroups, searchQuery]);

  // Helper to determine if a loan payment belongs to a specific loan
  const isPaymentBelongingToLoan = (p: LoanPayment, loan: Loan): boolean => {
    if (p.loanId) {
      return p.loanId === loan.id;
    }
    const isUserMatch = (loan.userId && p.userId === loan.userId) ||
      (loan.userEmail && p.userEmail && loan.userEmail.toLowerCase().trim() === p.userEmail.toLowerCase().trim());
    if (!isUserMatch) return false;

    // When payment lacks explicit loanId, attribute payment to loan only if made on/after loan sanction date
    const sanction = getSanctionDate(loan);
    const pDate = p.timestamp?.toDate ? p.timestamp.toDate() : (p.year && p.month ? new Date(p.year, p.month - 1, 1) : null);
    if (pDate) {
      const sanctionMonthStart = new Date(sanction.getFullYear(), sanction.getMonth(), 1).getTime();
      if (pDate.getTime() < sanctionMonthStart) {
        return false;
      }
    }
    return true;
  };

  // Aggregate statistics for the active borrower group (clubbed loans)
  const stats = useMemo(() => {
    if (!activeGroup || activeGroup.loans.length === 0) {
      return {
        approvedAmount: 0,
        totalPrincipalPaid: 0,
        totalInterestPaid: 0,
        totalPaid: 0,
        remainingPrincipal: 0,
        paidInstallmentsCount: 0,
        totalInstallments: 10,
        repaymentProgress: 0,
        settledDateStr: '-',
        activeLoansCount: 0,
        totalLoansCount: 0
      };
    }

    let totalApproved = 0;
    let totalPrincipalPaid = 0;
    let totalInterestPaid = 0;
    let totalInstallmentsCount = 0;
    let totalPaidInstallments = 0;
    const allSortedPaidPayments: LoanPayment[] = [];

    activeGroup.loans.forEach(loan => {
      const loanPrincipal = loan.approvedAmount || loan.amount || 0;
      const installments = loan.installments || Math.ceil(loanPrincipal / 5000) || 10;
      totalApproved += loanPrincipal;
      totalInstallmentsCount += installments;

      const rawPayments = loanPayments.filter(p => isPaymentBelongingToLoan(p, loan));

      const paidPayments = rawPayments.filter(p => p.status === 'paid');
      const pPaid = paidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const iPaid = paidPayments.reduce((sum, p) => sum + (p.interest || 0), 0);

      totalPrincipalPaid += pPaid;
      totalInterestPaid += iPaid;
      totalPaidInstallments += paidPayments.length;
      allSortedPaidPayments.push(...paidPayments);
    });

    const totalPaid = totalPrincipalPaid + totalInterestPaid;
    const remainingPrincipal = Math.max(0, totalApproved - totalPrincipalPaid);
    const repaymentProgress = totalApproved > 0 ? Math.min(100, Math.round((totalPrincipalPaid / totalApproved) * 100)) : 0;

    allSortedPaidPayments.sort((a, b) => {
      const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : ((a.year || 0) * 100 + (a.month || 0));
      const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : ((b.year || 0) * 100 + (b.month || 0));
      return timeA - timeB;
    });

    let settledDateStr = '-';
    if (remainingPrincipal <= 0) {
      if (allSortedPaidPayments.length > 0) {
        const last = allSortedPaidPayments[allSortedPaidPayments.length - 1];
        if (last.timestamp?.toDate) {
          settledDateStr = format(last.timestamp.toDate(), 'dd MMM yyyy');
        } else {
          settledDateStr = `${MONTH_NAMES[last.month] || last.month} ${last.year}`;
        }
      } else {
        settledDateStr = 'Settled';
      }
    }

    const activeLoansCount = activeGroup.loans.filter(l => {
      const lPrincipal = l.approvedAmount || l.amount || 0;
      const lRawPayments = loanPayments.filter(p => isPaymentBelongingToLoan(p, l));
      const lPaid = lRawPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + (p.amount || 0), 0);
      return l.status === 'approved' && (lPrincipal - lPaid > 0);
    }).length;

    return {
      approvedAmount: totalApproved,
      totalPrincipalPaid,
      totalInterestPaid,
      totalPaid,
      remainingPrincipal,
      paidInstallmentsCount: totalPaidInstallments,
      totalInstallments: totalInstallmentsCount,
      repaymentProgress,
      settledDateStr,
      activeLoansCount,
      totalLoansCount: activeGroup.loans.length
    };
  }, [activeGroup, loanPayments]);

  if (!activeGroup) {
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

  const borrowerName = activeGroup.borrowerName;
  const borrowerInitial = borrowerName.charAt(0).toUpperCase();
  const isLoanSettled = stats.remainingPrincipal <= 0;

  // Loan disbursement date(s)
  const disbursementDateStr = useMemo(() => {
    if (!activeGroup || activeGroup.loans.length === 0) return '-';
    if (activeGroup.loans.length === 1) {
      return format(getSanctionDate(activeGroup.loans[0]), 'dd MMM yyyy');
    }
    const dates = activeGroup.loans
      .map(l => format(getSanctionDate(l), 'dd MMM yyyy'))
      .filter((v, idx, arr) => arr.indexOf(v) === idx);
    return dates.join(' & ');
  }, [activeGroup]);

  // Helper to calculate next scheduled installment for an individual loan
  const getSingleLoanNextInstallment = (
    loan: Loan,
    allPayments: LoanPayment[]
  ): {
    month: number;
    year: number;
    periodLabel: string;
    principal: number;
    interest: number;
    total: number;
    installmentNumber: number;
  } | null => {
    const loanPrincipal = loan.approvedAmount || loan.amount || 0;
    const installments = loan.installments || Math.ceil(loanPrincipal / 5000) || 10;
    const sanctionDate = getSanctionDate(loan);

    const rawPayments = allPayments.filter(p => isPaymentBelongingToLoan(p, loan));

    const sortedPaidPayments = rawPayments.filter(p => p.status === 'paid');
    const totalPrincipalPaid = sortedPaidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const remainingPrincipal = Math.max(0, loanPrincipal - totalPrincipalPaid);

    if (remainingPrincipal <= 0) return null;

    const scheduledPrincipalPerMonth = Math.max(1, Math.round(loanPrincipal / installments));

    // Scan installments starting from the month after disbursement
    for (let i = 0; i < installments; i++) {
      const instDate = new Date(sanctionDate.getFullYear(), sanctionDate.getMonth() + i + 1, 1);
      const instMonth = instDate.getMonth() + 1;
      const instYear = instDate.getFullYear();

      const isPaid = sortedPaidPayments.some(p => p.month === instMonth && p.year === instYear);
      if (isPaid) continue;

      const pendingPayment = rawPayments.find(p => p.month === instMonth && p.year === instYear && p.status === 'pending');
      if (pendingPayment) {
        const principal = pendingPayment.amount || Math.min(remainingPrincipal, scheduledPrincipalPerMonth);
        const interest = pendingPayment.interest || Math.round(remainingPrincipal * 0.005);
        return {
          installmentNumber: i + 1,
          month: instMonth,
          year: instYear,
          periodLabel: `${MONTH_NAMES[instMonth] || instMonth} ${instYear}`,
          principal,
          interest,
          total: principal + interest
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
        total: principal + interest
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
      total: principal + interest
    };
  };

  // Next Month Installment calculation for clubbed active loans of the borrower
  const nextInstallmentInfo = useMemo(() => {
    if (!activeGroup || isLoanSettled) return null;

    const activeLoans = activeGroup.loans.filter(l => l.status === 'approved');
    if (activeLoans.length === 0) return null;

    const loanNextInstallments = activeLoans
      .map(l => ({ loan: l, next: getSingleLoanNextInstallment(l, loanPayments) }))
      .filter((item): item is { loan: Loan; next: NonNullable<ReturnType<typeof getSingleLoanNextInstallment>> } => item.next !== null);

    if (loanNextInstallments.length === 0) return null;

    const totalPrincipal = loanNextInstallments.reduce((sum, item) => sum + item.next.principal, 0);
    const totalInterest = loanNextInstallments.reduce((sum, item) => sum + item.next.interest, 0);
    const totalAmount = totalPrincipal + totalInterest;

    const uniquePeriods = Array.from(new Set(loanNextInstallments.map(i => i.next.periodLabel).filter(p => p !== 'Upcoming')));
    const periodLabel = uniquePeriods.length === 1 ? uniquePeriods[0] : (uniquePeriods.length > 1 ? uniquePeriods.join(' & ') : 'Upcoming');

    return {
      totalPrincipal,
      totalInterest,
      total: totalAmount,
      periodLabel,
      activeLoansCount: loanNextInstallments.length,
      installmentNumbersStr: loanNextInstallments.map(i => `#${i.next.installmentNumber}`).join(' & '),
      breakdown: loanNextInstallments.map(i => ({
        loanId: i.loan.id,
        amount: i.loan.approvedAmount || i.loan.amount || 0,
        principal: i.next.principal,
        interest: i.next.interest,
        total: i.next.total,
        periodLabel: i.next.periodLabel
      }))
    };
  }, [activeGroup, isLoanSettled, loanPayments]);

  const hasMultipleLoans = activeGroup.loans.length > 1;

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
                  : hasMultipleLoans
                    ? "bg-indigo-100/90 text-indigo-700 border-indigo-300/90"
                    : "bg-purple-100/80 text-purple-700 border-purple-300/80"
              )}>
                {isLoanSettled 
                  ? 'Settled Loan' 
                  : hasMultipleLoans 
                    ? `${activeGroup.activeLoans.length} Active Loans Clubbed` 
                    : 'Active Loan'}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap text-xs text-slate-500 font-medium mt-1">
              <span>Repayment timeline:</span>
              <span className="font-bold text-purple-800 bg-purple-100/70 px-2 py-0.5 rounded-md border border-purple-200/80">{borrowerName}</span>
              <span className="text-slate-300">•</span>
              <span className="font-bold text-slate-800">₹{stats.approvedAmount.toLocaleString('en-IN')}</span>
              {hasMultipleLoans && (
                <span className="text-[11px] text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/80">
                  {activeGroup.activeLoans.length} Loans Clubbed
                </span>
              )}
              <span className="text-slate-300">•</span>
              <span className="text-slate-600">Disbursed: <strong className="text-slate-800 font-bold">{disbursementDateStr}</strong></span>
            </div>
          </div>
        </div>

        {/* Borrower Switcher Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Previous / Next buttons */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={handlePrevGroup}
              className="p-2 hover:bg-purple-50 text-slate-500 hover:text-purple-600 transition-colors border-r border-slate-200/90 disabled:opacity-40 cursor-pointer"
              title="Previous Borrower"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 text-[11px] font-bold text-slate-600 select-none">
              {activeIndex + 1} / {borrowerGroups.length}
            </span>
            <button
              type="button"
              onClick={handleNextGroup}
              className="p-2 hover:bg-purple-50 text-slate-500 hover:text-purple-600 transition-colors disabled:opacity-40 cursor-pointer"
              title="Next Borrower"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Searchable Borrower Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-2 bg-white hover:bg-purple-50/50 border border-purple-200 rounded-xl shadow-2xs transition-all text-left text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                {borrowerInitial}
              </div>
              <div className="min-w-0 max-w-[140px] sm:max-w-[200px]">
                <p className="truncate font-bold text-slate-900 leading-tight">
                  {borrowerName}
                </p>
                <p className="truncate text-[10px] text-purple-600 font-bold">
                  ₹{stats.approvedAmount.toLocaleString('en-IN')}{hasMultipleLoans ? ` • ${activeGroup.activeLoans.length} Loans` : ''}
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
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-84 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search member or loan amount..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 py-1">
                    {filteredDropdownGroups.length === 0 ? (
                      <p className="text-center py-4 text-xs text-slate-400">No matching members found</p>
                    ) : (
                      filteredDropdownGroups.map((g) => {
                        const isSelected = g.key === activeGroup.key;
                        const totalAmt = g.loans.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
                        const isPaid = g.isAllSettled;
                        const isMulti = g.loans.length > 1;

                        return (
                          <button
                            key={`dropdown-group-${g.key}`}
                            type="button"
                            onClick={() => {
                              handleSelectGroup(g);
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
                                {g.borrowerName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs leading-tight font-bold">{g.borrowerName}</p>
                                <p className="truncate text-[10px] text-slate-500 font-normal">
                                  ₹{totalAmt.toLocaleString('en-IN')}{isMulti ? ` (${g.loans.length} Loans)` : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-md text-[9.5px] font-bold uppercase",
                                isPaid 
                                  ? "bg-emerald-100 text-emerald-800" 
                                  : isMulti 
                                    ? "bg-indigo-100 text-indigo-800" 
                                    : "bg-amber-100 text-amber-800"
                              )}>
                                {isPaid ? 'Settled' : isMulti ? `${g.activeLoans.length} Active` : 'Active'}
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
          {/* KPI Stat Cards for the Selected Member (Clubbed Loans) - 4 Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
            {/* Card 1: Sanctioned Loan (Indigo) */}
            <div className="bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-indigo-200/90 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-indigo-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/90 border border-indigo-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {hasMultipleLoans ? `${activeGroup.loans.length} Loans` : `${stats.totalInstallments} Months`}
                  </span>
                </div>
                <h4 className="text-indigo-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Sanctioned Loan</h4>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-indigo-950 tracking-tight truncate">
                  ₹{stats.approvedAmount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-indigo-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Disbursed:</span>
                <span className="font-bold text-indigo-700 truncate max-w-[130px]" title={disbursementDateStr}>{disbursementDateStr}</span>
              </div>
            </div>

            {/* Card 2: Total Repaid (Clubbed Principal Paid + Interest Paid) (Emerald) */}
            <div className="bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-emerald-200/90 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {stats.repaymentProgress}% Paid
                  </span>
                </div>
                <h4 className="text-emerald-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Total Repaid</h4>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-emerald-700 tracking-tight truncate">
                  ₹{stats.totalPaid.toLocaleString('en-IN')}
                </div>
                <div className="w-full bg-emerald-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${stats.repaymentProgress}%` }}
                  />
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-emerald-100/90 flex items-center justify-between text-[10px] sm:text-[10.5px] font-semibold">
                <span className="text-emerald-800">
                  Principal: <strong className="font-bold">₹{stats.totalPrincipalPaid.toLocaleString('en-IN')}</strong>
                </span>
                <span className="text-slate-300">•</span>
                <span className="text-amber-800">
                  Interest: <strong className="font-bold">₹{stats.totalInterestPaid.toLocaleString('en-IN')}</strong>
                </span>
              </div>
            </div>

            {/* Card 3: Next Installment (Blue) */}
            <div className="bg-gradient-to-br from-blue-50/90 via-blue-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-blue-200/90 hover:border-blue-400 hover:shadow-md hover:shadow-blue-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-blue-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-blue-700 bg-blue-100/90 border border-blue-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {isLoanSettled 
                      ? 'Settled' 
                      : nextInstallmentInfo 
                        ? (nextInstallmentInfo.activeLoansCount > 1 ? `${nextInstallmentInfo.activeLoansCount} Loans Due` : `${nextInstallmentInfo.installmentNumbersStr} Due`) 
                        : 'Due'}
                  </span>
                </div>
                <h4 className="text-blue-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Next Installment</h4>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-blue-950 tracking-tight truncate">
                  {isLoanSettled 
                    ? '₹0' 
                    : nextInstallmentInfo 
                      ? `₹${nextInstallmentInfo.total.toLocaleString('en-IN')}` 
                      : '₹0'}
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-blue-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Upcoming:</span>
                <span className="font-bold text-blue-700 truncate max-w-[140px]" title={nextInstallmentInfo?.breakdown ? nextInstallmentInfo.breakdown.map(b => `₹${b.total.toLocaleString('en-IN')} (${b.periodLabel})`).join(' + ') : undefined}>
                  {isLoanSettled 
                    ? 'No Dues' 
                    : nextInstallmentInfo 
                      ? `${nextInstallmentInfo.periodLabel}${nextInstallmentInfo.activeLoansCount > 1 ? ` (${nextInstallmentInfo.breakdown.map(b => `₹${b.total.toLocaleString('en-IN')}`).join(' + ')})` : ''}` 
                      : 'Completed'}
                </span>
              </div>
            </div>

            {/* Card 4: Outstanding Balance (Rose) */}
            <div className="bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-rose-200/90 hover:border-rose-400 hover:shadow-md hover:shadow-rose-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className={cn(
                    "w-7.5 h-7.5 rounded-xl text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform",
                    isLoanSettled ? "bg-emerald-600" : "bg-rose-600"
                  )}>
                    {isLoanSettled ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <AlertCircle className="w-4 h-4" />
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border",
                    isLoanSettled 
                      ? "text-emerald-700 bg-emerald-100/90 border-emerald-200" 
                      : "text-rose-700 bg-rose-100/90 border-rose-200"
                  )}>
                    {isLoanSettled ? 'Settled' : 'Pending'}
                  </span>
                </div>
                <h4 className="text-rose-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Outstanding Balance</h4>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-rose-700 tracking-tight truncate">
                  {stats.remainingPrincipal > 0 ? `₹${stats.remainingPrincipal.toLocaleString('en-IN')}` : '₹0'}
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-rose-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Balance:</span>
                <span className="font-bold text-rose-700">
                  {isLoanSettled ? 'Closed' : hasMultipleLoans ? `${activeGroup.activeLoans.length} Loans Due` : 'Principal Due'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
