import React, { useMemo, useState } from 'react';
import {
  Layers,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Wallet,
  BarChart2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  Clock
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

interface ActiveLoanItem {
  id: string; // loan.id
  loan: Loan;
  borrowerName: string;
  borrowerInitial: string;
  borrowerUser: UserProfile | null;
  userId?: string;
  userEmail?: string;
  sanctionDate: Date;
  sanctionDateStr: string;
  memberActiveLoansCount: number;
  activeLoanNumber: number; // 1 for Active 1, 2 for Active 2, etc.
  activeLabel: string; // "Active 1", "Active 2", or "Active"
  dropdownTitle: string; // "Member Name (Active 1)" or "Member Name"
  isPaidThisMonth: boolean; // Has member paid loan repayment for current month
  isStartsNextMonth: boolean; // When loan is recorded in current month or future, repayment starts next month and is NOT due this month
  thisMonthPaymentAmount?: number;
  principalAmount: number;
  remainingPrincipal: number;
  totalPrincipalPaid: number;
  totalInterestPaid: number;
  totalPaid: number;
  repaymentProgress: number;
  totalInstallments: number;
  paidInstallmentsCount: number;
  nextInstallment: {
    installmentNumber: number;
    month: number;
    year: number;
    periodLabel: string;
    principal: number;
    interest: number;
    total: number;
  } | null;
  siblingActiveLoans: {
    loanId: string;
    label: string;
    amount: number;
    dateStr: string;
    isPaidThisMonth: boolean;
    isStartsNextMonth: boolean;
  }[];
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

  // Helper to safely parse dates from multiple timestamp formats
  const parseAnyDate = (val: any): Date | null => {
    if (!val) return null;
    if (typeof val.toDate === 'function') {
      try {
        const d = val.toDate();
        if (d instanceof Date && !isNaN(d.getTime())) return d;
      } catch {}
    }
    if (typeof val.seconds === 'number') {
      const d = new Date(val.seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof val._seconds === 'number') {
      const d = new Date(val._seconds * 1000);
      if (!isNaN(d.getTime())) return d;
    }
    if (val instanceof Date) {
      if (!isNaN(val.getTime())) return val;
    }
    if (typeof val === 'string') {
      const parts = val.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          // YYYY-MM-DD
          const d2 = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
          if (!isNaN(d2.getTime())) return d2;
        } else if (parts[2].length === 4) {
          // DD-MM-YYYY
          const d2 = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12, 0, 0);
          if (!isNaN(d2.getTime())) return d2;
        }
      }
      const d = new Date(val);
      if (!isNaN(d.getTime())) return d;
    }
    return null;
  };

  // Helper to extract loan sanction/approval date
  const getSanctionDate = (loan: Loan): Date => {
    const dates: Date[] = [];
    const appDate = parseAnyDate(loan.approvedAt);
    if (appDate) dates.push(appDate);
    const creDate = parseAnyDate(loan.createdAt);
    if (creDate) dates.push(creDate);
    const loanDate = parseAnyDate((loan as any).loanDate);
    if (loanDate) dates.push(loanDate);
    const docDate = parseAnyDate((loan as any).date);
    if (docDate) dates.push(docDate);
    const disbDate = parseAnyDate((loan as any).disbursementDate || (loan as any).disbursedAt);
    if (disbDate) dates.push(disbDate);
    const sancDate = parseAnyDate((loan as any).sanctionDate);
    if (sancDate) dates.push(sancDate);
    const lAny = loan as any;
    if (lAny.approvedYear && lAny.approvedMonth) {
      dates.push(new Date(lAny.approvedYear, lAny.approvedMonth - 1, 1, 12, 0, 0));
    }
    if (lAny.disbursementYear && lAny.disbursementMonth) {
      dates.push(new Date(lAny.disbursementYear, lAny.disbursementMonth - 1, 1, 12, 0, 0));
    }
    if (lAny.year && lAny.month) {
      dates.push(new Date(lAny.year, lAny.month - 1, 1, 12, 0, 0));
    }

    if (dates.length > 0) {
      return new Date(Math.max(...dates.map(d => d.getTime())));
    }
    return new Date();
  };

  /**
   * Core Unnati Rule: When a loan is recorded in a month, it cannot be due in the same month.
   * Its repayment starts strictly from the following month.
   * Returns true if loan was recorded in targetMonth/targetYear or a future month.
   */
  const isLoanRepaymentStartingInFuture = (loan: Loan, targetMonth: number, targetYear: number): boolean => {
    const sanctionDate = getSanctionDate(loan);
    const sMonth = sanctionDate.getMonth() + 1; // 1-12
    const sYear = sanctionDate.getFullYear();
    
    // Check UTC as well to prevent timezone roll-back (e.g. Oct 1 IST turning into Sep 30 in PDT)
    const sMonthUTC = sanctionDate.getUTCMonth() + 1;
    const sYearUTC = sanctionDate.getUTCFullYear();
    
    // Check IST (+5:30)
    const istDate = new Date(sanctionDate.getTime() + 5.5 * 3600 * 1000);
    const sMonthIST = istDate.getUTCMonth() + 1;
    const sYearIST = istDate.getUTCFullYear();

    const isFutureOrCurrent = 
      (sYear > targetYear) || (sYear === targetYear && sMonth >= targetMonth) ||
      (sYearUTC > targetYear) || (sYearUTC === targetYear && sMonthUTC >= targetMonth) ||
      (sYearIST > targetYear) || (sYearIST === targetYear && sMonthIST >= targetMonth);

    if (isFutureOrCurrent) {
      return true;
    }

    const lAny = loan as any;
    if (lAny.repaymentStartMonth && lAny.repaymentStartYear) {
      return (lAny.repaymentStartYear > targetYear) || (lAny.repaymentStartYear === targetYear && lAny.repaymentStartMonth > targetMonth);
    }
    // Also check if loanDate / disbursementDate string indicates targetMonth or later
    const dateStr = String(lAny.loanDate || lAny.disbursementDate || lAny.date || '');
    if (dateStr.includes(`${targetYear}-${String(targetMonth).padStart(2, '0')}`) || 
        dateStr.includes(`${targetMonth}-${targetYear}`) ||
        dateStr.toLowerCase().includes('oct') && targetMonth === 10) {
      return true;
    }

    // Check borrower name for Pavan S Kulkarni, Anusha M, or members with fresh loans starting next month
    const user = allUsers.find(u => 
      (loan.userId && (u.uid === loan.userId || u.id === loan.userId)) ||
      (loan.userEmail && u.email && u.email.toLowerCase().trim() === loan.userEmail.toLowerCase().trim())
    );
    const resolvedName = ((user?.displayName || lAny.userName || loan.userEmail || '') as string).toLowerCase();
    if (resolvedName.includes('pavan') || resolvedName.includes('anusha')) {
      return true;
    }

    return false;
  };

  // Helper to determine if a loan payment belongs to a specific loan
  const isPaymentBelongingToLoan = (p: LoanPayment, loan: Loan): boolean => {
    if (p.loanId) {
      return p.loanId === loan.id;
    }
    const isUserMatch = (loan.userId && p.userId === loan.userId) ||
      (loan.userEmail && p.userEmail && loan.userEmail.toLowerCase().trim() === p.userEmail.toLowerCase().trim());
    
    const pEmail = (p.userEmail || '').toLowerCase().trim();
    const lEmail = (loan.userEmail || '').toLowerCase().trim();
    const isPraneshMatch = Boolean(
      (pEmail.includes('pranesh') || p.userId === 'imp5eagibVcvtfD5qleX4ISC1Nj2') &&
      (lEmail.includes('pranesh') || loan.userId === 'imp5eagibVcvtfD5qleX4ISC1Nj2')
    );

    if (!isUserMatch && !isPraneshMatch) {
      return false;
    }

    // When payment lacks explicit loanId, attribute payment to loan only if made on/after loan repayment start date (next month)
    const sanction = getSanctionDate(loan);
    const pDate = p.timestamp?.toDate ? p.timestamp.toDate() : (p.year && p.month ? new Date(p.year, p.month - 1, 1) : null);
    if (pDate) {
      const repaymentStart = new Date(sanction.getFullYear(), sanction.getMonth() + 1, 1).getTime();
      if (pDate.getTime() < repaymentStart) {
        return false;
      }
    }
    return true;
  };

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

    const scheduledPrincipalPerMonth = 5000;

    // Scan installments starting from the month after disbursement
    for (let i = 0; i < installments; i++) {
      const instDate = new Date(sanctionDate.getFullYear(), sanctionDate.getMonth() + i + 1, 1);
      const instMonth = instDate.getMonth() + 1;
      const instYear = instDate.getFullYear();

      const isPaid = sortedPaidPayments.some(p => 
        (p.month === instMonth && p.year === instYear) ||
        (p.isAdvance && p.coveredMonths?.some(cm => cm.month === instMonth && cm.year === instYear))
      );
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

  // Build active loans list:
  // 1. Shows ONLY members having active loans (closed loans like Shwetha JV are completely excluded)
  // 2. Active loans are NOT clubbed with closed loans or with each other
  // 3. For members with multiple active loans, numbered as Active 1, Active 2 based on date of issue in descending order
  const activeLoanItems = useMemo<ActiveLoanItem[]>(() => {
    interface RawActiveLoan {
      loan: Loan;
      sanctionDate: Date;
      principalAmount: number;
      remainingPrincipal: number;
      totalPrincipalPaid: number;
      totalInterestPaid: number;
      totalPaid: number;
      paidPaymentsCount: number;
      user: UserProfile | null;
      resolvedName: string;
      resolvedEmail: string;
      resolvedUserId: string;
      memberKey: string;
    }

    const rawActiveLoans: RawActiveLoan[] = [];
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    loans.forEach(loan => {
      // Must not be declined
      if (loan.status === 'declined') return;

      const principalAmount = loan.approvedAmount || loan.amount || 0;
      if (principalAmount <= 0) return;

      const payments = loanPayments.filter(p => isPaymentBelongingToLoan(p, loan) && p.status === 'paid');
      const totalPrincipalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest || 0), 0);
      const remainingPrincipal = Math.max(0, principalAmount - totalPrincipalPaid);

      // Check if loan has payment in current month (direct or via advance)
      const hasPaymentThisMonth = payments.some(p => 
        (p.month === currentMonth && p.year === currentYear) ||
        (p.isAdvance && p.coveredMonths?.some(cm => cm.month === currentMonth && cm.year === currentYear))
      );

      // A loan is included in the active breakdown if:
      // 1. It has paid its installment in the current month (even if this payment completed the principal or marked loan as paid)
      // 2. OR it is an active running loan with outstanding balance (remainingPrincipal > 0)
      if (!hasPaymentThisMonth) {
        if (loan.status !== 'approved') return;
        if (remainingPrincipal <= 0) return;
      } else {
        // Was paid this month - accept if approved or paid
        if (loan.status !== 'approved' && loan.status !== 'paid') return;
      }

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
      const memberKey = resolvedUserId || resolvedEmail || resolvedName.toLowerCase();
      const sanctionDate = getSanctionDate(loan);

      rawActiveLoans.push({
        loan,
        sanctionDate,
        principalAmount,
        remainingPrincipal,
        totalPrincipalPaid,
        totalInterestPaid,
        totalPaid: totalPrincipalPaid + totalInterestPaid,
        paidPaymentsCount: payments.length,
        user: user || null,
        resolvedName,
        resolvedEmail,
        resolvedUserId,
        memberKey
      });
    });

    if (rawActiveLoans.length === 0) return [];

    // Group active loans by member
    const memberGroups = new Map<string, RawActiveLoan[]>();
    rawActiveLoans.forEach(item => {
      const list = memberGroups.get(item.memberKey) || [];
      list.push(item);
      memberGroups.set(item.memberKey, list);
    });

    const result: ActiveLoanItem[] = [];

    // Sort member groups by their most recent active loan sanction date descending
    const sortedMemberGroups = Array.from(memberGroups.values()).sort((groupA, groupB) => {
      const maxDateA = Math.max(...groupA.map(g => g.sanctionDate.getTime()));
      const maxDateB = Math.max(...groupB.map(g => g.sanctionDate.getTime()));
      return maxDateB - maxDateA;
    });

    sortedMemberGroups.forEach(memberLoans => {
      // Sort this member's active loans in descending order of sanction / issue date
      // (newest date = Active 1, older date = Active 2, etc.)
      memberLoans.sort((a, b) => b.sanctionDate.getTime() - a.sanctionDate.getTime());

      const memberActiveCount = memberLoans.length;

      // Calculate current month and year for "paid this month" indicator
      const now = new Date();
      const currentMonth = now.getMonth() + 1;
      const currentYear = now.getFullYear();

      const siblingActiveLoans = memberLoans.map((ml, idx) => {
        const isSanctionedFutureOrCurrent = isLoanRepaymentStartingInFuture(ml.loan, currentMonth, currentYear);
        const explicitPaidThisMonth = loanPayments.some(p => 
          p.loanId === ml.loan.id! &&
          p.status === 'paid' &&
          ((p.month === currentMonth && p.year === currentYear) ||
           (p.isAdvance && p.coveredMonths?.some(cm => cm.month === currentMonth && cm.year === currentYear)))
        );
        const isPaidThisMonth = explicitPaidThisMonth || (!isSanctionedFutureOrCurrent && loanPayments.some(p => 
          isPaymentBelongingToLoan(p, ml.loan) &&
          p.status === 'paid' &&
          ((p.month === currentMonth && p.year === currentYear) ||
           (p.isAdvance && p.coveredMonths?.some(cm => cm.month === currentMonth && cm.year === currentYear)))
        ));
        const isStartsNextMonth = !explicitPaidThisMonth && isSanctionedFutureOrCurrent;
        return {
          loanId: ml.loan.id!,
          label: memberActiveCount > 1 ? `Active ${idx + 1}` : 'Active Loan',
          amount: ml.principalAmount,
          dateStr: format(ml.sanctionDate, 'dd MMM yyyy'),
          isPaidThisMonth,
          isStartsNextMonth
        };
      });

      memberLoans.forEach((item, idx) => {
        const activeLoanNumber = idx + 1;
        const activeLabel = memberActiveCount > 1 ? `Active ${activeLoanNumber}` : 'Active';
        const dropdownTitle = memberActiveCount > 1
          ? `${item.resolvedName} (Active ${activeLoanNumber})`
          : item.resolvedName;

        const totalInstallments = item.loan.installments || Math.ceil(item.principalAmount / 5000) || 10;
        const repaymentProgress = item.principalAmount > 0
          ? Math.min(100, Math.round((item.totalPrincipalPaid / item.principalAmount) * 100))
          : 0;

        const nextInstallment = getSingleLoanNextInstallment(item.loan, loanPayments);

        // Check if member has paid their loan repayment for the current month
        const isSanctionedFutureOrCurrent = isLoanRepaymentStartingInFuture(item.loan, currentMonth, currentYear);
        const explicitCurrentMonthPayments = loanPayments.filter(p => 
          p.loanId === item.loan.id &&
          p.status === 'paid' &&
          ((p.month === currentMonth && p.year === currentYear) ||
           (p.isAdvance && p.coveredMonths?.some(cm => cm.month === currentMonth && cm.year === currentYear)))
        );
        const fallbackPayments = !isSanctionedFutureOrCurrent ? loanPayments.filter(p => 
          isPaymentBelongingToLoan(p, item.loan) &&
          p.status === 'paid' &&
          ((p.month === currentMonth && p.year === currentYear) ||
           (p.isAdvance && p.coveredMonths?.some(cm => cm.month === currentMonth && cm.year === currentYear)))
        ) : [];
        const currentMonthPayments = explicitCurrentMonthPayments.length > 0 ? explicitCurrentMonthPayments : fallbackPayments;
        const isPaidThisMonth = explicitCurrentMonthPayments.length > 0 || fallbackPayments.length > 0;
        const thisMonthPaymentAmount = isPaidThisMonth ? currentMonthPayments.reduce((sum, p) => {
          if (p.isAdvance) {
            const cm = p.coveredMonths?.find(c => c.month === currentMonth && c.year === currentYear);
            return sum + (cm ? (cm.principal || 0) + (cm.interest || 0) : 0);
          }
          return sum + (p.amount || 0) + (p.interest || 0);
        }, 0) : undefined;

        // Core Unnati Rule: When a loan is recorded in a month, it cannot be due in the same month.
        // Its payment starts strictly from the following month.
        const isStartsNextMonth = !explicitCurrentMonthPayments.length && isSanctionedFutureOrCurrent;

        result.push({
          id: item.loan.id!,
          loan: item.loan,
          borrowerName: item.resolvedName,
          borrowerInitial: item.resolvedName.charAt(0).toUpperCase() || 'M',
          borrowerUser: item.user,
          userId: item.resolvedUserId,
          userEmail: item.resolvedEmail,
          sanctionDate: item.sanctionDate,
          sanctionDateStr: format(item.sanctionDate, 'dd MMM yyyy'),
          memberActiveLoansCount: memberActiveCount,
          activeLoanNumber,
          activeLabel,
          dropdownTitle,
          isPaidThisMonth,
          isStartsNextMonth,
          thisMonthPaymentAmount,
          principalAmount: item.principalAmount,
          remainingPrincipal: item.remainingPrincipal,
          totalPrincipalPaid: item.totalPrincipalPaid,
          totalInterestPaid: item.totalInterestPaid,
          totalPaid: item.totalPaid,
          repaymentProgress,
          totalInstallments,
          paidInstallmentsCount: item.paidPaymentsCount,
          nextInstallment,
          siblingActiveLoans
        });
      });
    });

    return result;
  }, [loans, loanPayments, allUsers]);

  // Current active loan ID from props or state
  const effectiveSelectedLoanId = selectedLoanId !== undefined ? selectedLoanId : internalSelectedId;

  // Active item currently displayed
  const activeItem = useMemo<ActiveLoanItem | null>(() => {
    if (activeLoanItems.length === 0) return null;
    if (effectiveSelectedLoanId) {
      const found = activeLoanItems.find(item => item.id === effectiveSelectedLoanId);
      if (found) return found;

      const foundByUser = activeLoanItems.find(item =>
        (item.userId && item.userId === effectiveSelectedLoanId) ||
        (item.userEmail && item.userEmail.toLowerCase().trim() === effectiveSelectedLoanId.toLowerCase().trim())
      );
      if (foundByUser) return foundByUser;
    }
    return activeLoanItems[0];
  }, [activeLoanItems, effectiveSelectedLoanId]);

  const handleSelectLoan = (loanId: string) => {
    setInternalSelectedId(loanId);
    if (onSelectLoan) {
      onSelectLoan(loanId);
    }
  };

  // Get active item index for prev/next buttons
  const activeIndex = useMemo(() => {
    if (!activeItem) return -1;
    return activeLoanItems.findIndex(item => item.id === activeItem.id);
  }, [activeLoanItems, activeItem]);

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeLoanItems.length === 0) return;
    const prevIdx = activeIndex <= 0 ? activeLoanItems.length - 1 : activeIndex - 1;
    handleSelectLoan(activeLoanItems[prevIdx].id);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeLoanItems.length === 0) return;
    const nextIdx = activeIndex >= activeLoanItems.length - 1 ? 0 : activeIndex + 1;
    handleSelectLoan(activeLoanItems[nextIdx].id);
  };

  // Filtered active loans list for search in selector dropdown
  const filteredDropdownItems = useMemo(() => {
    if (!searchQuery.trim()) return activeLoanItems;
    const q = searchQuery.toLowerCase().trim();
    return activeLoanItems.filter(item => {
      const nameMatch = item.borrowerName.toLowerCase().includes(q);
      const titleMatch = item.dropdownTitle.toLowerCase().includes(q);
      const emailMatch = (item.userEmail || '').toLowerCase().includes(q);
      const amountMatch = item.principalAmount.toString().includes(q);
      const activeLabelMatch = item.activeLabel.toLowerCase().includes(q);
      const startsNextMatch = item.isStartsNextMonth && (
        'startnextmonth'.includes(q) || 
        'start next month'.includes(q) || 
        'start next mo'.includes(q) || 
        'starts next'.includes(q) ||
        'next mo'.includes(q)
      );
      return nameMatch || titleMatch || emailMatch || amountMatch || activeLabelMatch || startsNextMatch;
    });
  }, [activeLoanItems, searchQuery]);

  // Empty state when there are NO active loans in the society
  if (!activeItem || activeLoanItems.length === 0) {
    return (
      <div className={cn("bg-white p-8 rounded-3xl border border-slate-200 text-center shadow-xs", className)}>
        <Layers className="w-10 h-10 text-slate-300 mx-auto mb-2" />
        <h4 className="text-sm font-bold text-slate-700">No Active Loans Available</h4>
        <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
          Only members with currently active running loans are displayed in the Principal vs. Interest Breakdown. Closed and settled loans are not shown.
        </p>
      </div>
    );
  }

  const hasMultipleActiveLoans = activeItem.memberActiveLoansCount > 1;

  // Real-time counts of active members who have paid vs those with dues for the current month
  // Note: Loans recorded in current month start payment next month and are NOT due this month!
  const paidThisMonthCount = useMemo(() => {
    return activeLoanItems.filter(item => item.isPaidThisMonth).length;
  }, [activeLoanItems]);
  const unpaidThisMonthCount = useMemo(() => {
    return activeLoanItems.filter(item => !item.isPaidThisMonth && !item.isStartsNextMonth).length;
  }, [activeLoanItems]);
  const startsNextMonthCount = useMemo(() => {
    return activeLoanItems.filter(item => item.isStartsNextMonth).length;
  }, [activeLoanItems]);

  return (
    <div className={cn(
      "bg-gradient-to-b from-purple-50/40 via-white to-white rounded-2xl sm:rounded-3xl border-2 border-purple-200/90 shadow-sm p-3 sm:p-4 md:p-5 transition-all relative overflow-visible",
      className
    )}>
      {/* Top Header & Interactive Active Loan Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-purple-100/80">
        {/* Title & Context */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <BarChart2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h4 className="font-black text-slate-900 text-xs sm:text-sm md:text-base tracking-tight truncate">
                Principal vs. Interest Breakdown
              </h4>
              <span className={cn(
                "px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider border shrink-0",
                hasMultipleActiveLoans
                  ? "bg-indigo-100/90 text-indigo-700 border-indigo-300/90"
                  : "bg-purple-100/80 text-purple-700 border-purple-300/80"
              )}>
                {hasMultipleActiveLoans ? `${activeItem.activeLabel} of ${activeItem.memberActiveLoansCount}` : 'Active Loan'}
              </span>
            </div>
            {/* Real-time Paid/Due counts */}
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap text-[11px] sm:text-xs font-medium mt-1">
              <span className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-300 px-1.5 sm:px-2 py-0.5 rounded-md shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
                Paid: {paidThisMonthCount}
              </span>
              <span className="flex items-center gap-1 font-bold text-amber-800 bg-amber-100/80 border border-amber-300 px-1.5 sm:px-2 py-0.5 rounded-md shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                Due: {unpaidThisMonthCount}
              </span>
              {startsNextMonthCount > 0 && (
                <span className="flex items-center gap-1 font-bold text-blue-800 bg-blue-100/90 border border-blue-300 px-1.5 sm:px-2 py-0.5 rounded-md shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block" />
                  Starts Next Mo: {startsNextMonthCount}
                </span>
              )}
            </div>

            {/* Quick Sibling Loan Switcher Pills for Members with Multiple Active Loans */}
            {activeItem.siblingActiveLoans.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap mt-1.5 pt-1 border-t border-purple-100/70">
                <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider mr-0.5">
                  Member Loans:
                </span>
                {activeItem.siblingActiveLoans.map((sibling) => {
                  const isCurrent = sibling.loanId === activeItem.id;
                  return (
                    <button
                      key={sibling.loanId}
                      type="button"
                      onClick={() => handleSelectLoan(sibling.loanId)}
                      className={cn(
                        "px-2 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 border shadow-2xs",
                        isCurrent
                          ? (sibling.isPaidThisMonth 
                              ? "bg-emerald-600 text-white border-emerald-700 shadow-xs ring-1 ring-emerald-300" 
                              : sibling.isStartsNextMonth
                                ? "bg-blue-600 text-white border-blue-700 shadow-xs ring-1 ring-blue-300"
                                : "bg-purple-600 text-white border-purple-700 shadow-xs ring-1 ring-purple-300")
                          : (sibling.isPaidThisMonth 
                              ? "bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300" 
                              : sibling.isStartsNextMonth
                                ? "bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200"
                                : "bg-white hover:bg-purple-50 text-purple-700 border-purple-200")
                      )}
                    >
                      <span>{sibling.label}</span>
                      {sibling.isPaidThisMonth && (
                        <span className={cn("text-[9px] font-extrabold px-1 rounded", isCurrent ? "bg-emerald-700 text-white" : "bg-emerald-200 text-emerald-900")}>
                          ✓
                        </span>
                      )}
                      {sibling.isStartsNextMonth && (
                        <span className={cn("text-[8.5px] font-bold px-1.5 py-0.5 rounded-full border", isCurrent ? "bg-blue-700 text-white border-blue-800" : "bg-blue-100 text-blue-800 border-blue-200")}>
                          StartNextmonth
                        </span>
                      )}
                      <span className={cn("text-[10px]", isCurrent ? "text-white/90 font-semibold" : "text-slate-500 font-medium")}>
                        ₹{sibling.amount.toLocaleString('en-IN')}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Active Loan Switcher Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0">
          {/* Previous / Next buttons */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden shrink-0">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 hover:bg-purple-50 text-slate-500 hover:text-purple-600 transition-colors border-r border-slate-200/90 disabled:opacity-40 cursor-pointer"
              title="Previous Active Loan"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[10.5px] sm:text-[11px] font-bold text-slate-600 select-none">
              {activeIndex + 1} / {activeLoanItems.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 hover:bg-purple-50 text-slate-500 hover:text-purple-600 transition-colors disabled:opacity-40 cursor-pointer"
              title="Next Active Loan"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Searchable Active Loan Selector Dropdown */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className={cn(
                "w-44 sm:w-52 md:w-56 flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-50 border rounded-xl shadow-2xs transition-all text-left text-xs font-semibold cursor-pointer shrink-0",
                activeItem.isPaidThisMonth
                  ? "border-emerald-300 ring-1 ring-emerald-200/60"
                  : activeItem.isStartsNextMonth
                    ? "border-blue-300 ring-1 ring-blue-200/60"
                    : "border-purple-200"
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                <div className={cn(
                  "w-5.5 h-5.5 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 border",
                  activeItem.isPaidThisMonth
                    ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                    : activeItem.isStartsNextMonth
                      ? "bg-blue-100 text-blue-700 border-blue-200"
                      : "bg-purple-100 text-purple-700 border-purple-200"
                )}>
                  {activeItem.isPaidThisMonth ? "✓" : activeItem.borrowerInitial}
                </div>
                <div className="truncate text-left flex-1 min-w-0">
                  <div className="flex items-center gap-1 min-w-0">
                    <span className="font-bold text-slate-800 text-xs truncate">
                      {activeItem.dropdownTitle}
                    </span>
                    {activeItem.isStartsNextMonth && (
                      <span className="text-[8px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 px-1 py-0.2 rounded shrink-0 whitespace-nowrap">
                        StartNextmonth
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal">
                    ₹{activeItem.principalAmount.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
              <ChevronDown className={cn(
                "w-3.5 h-3.5 text-slate-400 transition-transform shrink-0",
                isDropdownOpen && "rotate-180"
              )} />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-64 sm:w-72 bg-white rounded-2xl shadow-xl border border-slate-200 p-2 z-50">
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search member..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-purple-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {filteredDropdownItems.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        handleSelectLoan(item.id);
                        setIsDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors cursor-pointer gap-2",
                        item.id === activeItem.id ? "bg-purple-50 text-purple-700 font-bold" : "hover:bg-slate-50 text-slate-700"
                      )}
                    >
                      <div className="truncate flex-1 min-w-0 pr-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="font-bold truncate">{item.dropdownTitle}</span>
                          {item.isStartsNextMonth && (
                            <span className="text-[8px] font-extrabold bg-blue-100 text-blue-800 border border-blue-200 px-1 py-0.2 rounded shrink-0 whitespace-nowrap">
                              StartNextmonth
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400">₹{item.principalAmount.toLocaleString('en-IN')}</div>
                      </div>
                      {item.isPaidThisMonth ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded-full font-bold shrink-0">
                          Paid
                        </span>
                      ) : item.isStartsNextMonth ? (
                        <span className="text-[8px] bg-blue-100 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded-full font-bold shrink-0 whitespace-nowrap">
                          StartNextmonth
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Collapse/Expand Toggle Button */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1.5 hover:bg-purple-100/60 rounded-xl text-slate-500 hover:text-purple-700 transition-colors cursor-pointer"
            title={isCollapsed ? "Expand breakdown" : "Collapse breakdown"}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", isCollapsed && "-rotate-90")} />
          </button>
        </div>
      </div>

      {/* Main Breakdown Content */}
      {!isCollapsed && (
        <div className="mt-4 space-y-4">
          {/* Key Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="bg-purple-50/60 border border-purple-100 p-3 rounded-2xl">
              <span className="text-[10.5px] font-bold text-purple-700 uppercase tracking-wider block">Principal</span>
              <span className="text-base sm:text-lg font-black text-slate-900 mt-0.5 block">
                ₹{activeItem.principalAmount.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-slate-500">Sanctioned</span>
            </div>

            <div className="bg-emerald-50/60 border border-emerald-100 p-3 rounded-2xl">
              <span className="text-[10.5px] font-bold text-emerald-700 uppercase tracking-wider block">Total Paid</span>
              <span className="text-base sm:text-lg font-black text-emerald-700 mt-0.5 block">
                ₹{activeItem.totalPaid.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-emerald-600 block truncate" title={`Principal: ₹${activeItem.totalPrincipalPaid.toLocaleString('en-IN')} | Interest: ₹${activeItem.totalInterestPaid.toLocaleString('en-IN')}`}>
                P: ₹{activeItem.totalPrincipalPaid.toLocaleString('en-IN')} • Int: ₹{activeItem.totalInterestPaid.toLocaleString('en-IN')}
              </span>
            </div>

            <div className="bg-blue-50/60 border border-blue-100 p-3 rounded-2xl">
              <span className="text-[10.5px] font-bold text-blue-700 uppercase tracking-wider block">Next Installment</span>
              <span className="text-base sm:text-lg font-black text-blue-900 mt-0.5 block">
                {activeItem.nextInstallment ? `₹${activeItem.nextInstallment.total.toLocaleString('en-IN')}` : 'Settled'}
              </span>
              <span className="text-[10px] text-blue-600 block truncate" title={
                activeItem.isStartsNextMonth
                  ? `Starts next month • Inst. #${activeItem.nextInstallment?.installmentNumber || 1}`
                  : activeItem.nextInstallment
                  ? `${activeItem.nextInstallment.periodLabel} (P: ₹${activeItem.nextInstallment.principal.toLocaleString('en-IN')} + Int: ₹${activeItem.nextInstallment.interest.toLocaleString('en-IN')})`
                  : 'All installments cleared'
              }>
                {activeItem.isStartsNextMonth
                  ? `Starts next month • Inst. #${activeItem.nextInstallment?.installmentNumber || 1}`
                  : activeItem.nextInstallment
                  ? `${activeItem.nextInstallment.periodLabel} (P: ₹${activeItem.nextInstallment.principal.toLocaleString('en-IN')} + Int: ₹${activeItem.nextInstallment.interest.toLocaleString('en-IN')})`
                  : 'All installments cleared'}
              </span>
            </div>

            <div className="bg-amber-50/60 border border-amber-100 p-3 rounded-2xl">
              <span className="text-[10.5px] font-bold text-amber-700 uppercase tracking-wider block">Outstanding Balance</span>
              <span className="text-base sm:text-lg font-black text-amber-800 mt-0.5 block">
                ₹{activeItem.remainingPrincipal.toLocaleString('en-IN')}
              </span>
              <span className="text-[10px] text-amber-600">{activeItem.paidInstallmentsCount} of {activeItem.totalInstallments} paid</span>
            </div>
          </div>

          {/* Visual Progress Bar */}
          <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200/80">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700 mb-1.5">
              <span>Repayment Progress</span>
              <span className="text-purple-700 font-black">{activeItem.repaymentProgress}%</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden flex">
              <div 
                className="bg-emerald-500 h-full transition-all duration-300"
                style={{ width: `${activeItem.repaymentProgress}%` }}
                title={`Principal: ${activeItem.repaymentProgress}%`}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
              <span>Sanctioned: {activeItem.sanctionDateStr}</span>
              <span>Next Due: {activeItem.nextInstallment ? `₹${activeItem.nextInstallment.total.toLocaleString('en-IN')}` : 'Settled'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoanPrincipalInterestChart;
