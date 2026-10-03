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
  Search
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

    loans.forEach(loan => {
      // Must be approved loan (paid, rejected, pending are NOT active)
      if (loan.status !== 'approved') return;

      const principalAmount = loan.approvedAmount || loan.amount || 0;
      if (principalAmount <= 0) return;

      const payments = loanPayments.filter(p => isPaymentBelongingToLoan(p, loan) && p.status === 'paid');
      const totalPrincipalPaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest || 0), 0);
      const remainingPrincipal = Math.max(0, principalAmount - totalPrincipalPaid);

      // If remaining principal is 0 or less, loan is closed / settled -> Exclude from active breakdown!
      if (remainingPrincipal <= 0) return;

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

      const siblingActiveLoans = memberLoans.map((ml, idx) => ({
        loanId: ml.loan.id!,
        label: memberActiveCount > 1 ? `Active ${idx + 1}` : 'Active Loan',
        amount: ml.principalAmount,
        dateStr: format(ml.sanctionDate, 'dd MMM yyyy')
      }));

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
      return nameMatch || titleMatch || emailMatch || amountMatch || activeLabelMatch;
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
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] sm:text-xs text-slate-500 font-medium mt-0.5">
              <span className="hidden xs:inline">Timeline:</span>
              <span className="font-bold text-purple-800 bg-purple-100/70 px-1.5 sm:px-2 py-0.5 rounded-md border border-purple-200/80 truncate max-w-[150px] sm:max-w-none">
                {activeItem.borrowerName}
              </span>
              {hasMultipleActiveLoans && (
                <span className="text-[10.5px] text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/80">
                  {activeItem.activeLabel} ({activeItem.sanctionDateStr})
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
                          ? "bg-purple-600 text-white border-purple-700 shadow-xs ring-1 ring-purple-300"
                          : "bg-white hover:bg-purple-50 text-purple-700 border-purple-200"
                      )}
                    >
                      <span>{sibling.label}</span>
                      <span className={cn("text-[10px]", isCurrent ? "text-purple-100 font-semibold" : "text-slate-500 font-medium")}>
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
              className="w-44 sm:w-52 md:w-56 flex items-center justify-between gap-1.5 px-2.5 py-1.5 bg-white hover:bg-purple-50/50 border border-purple-200 rounded-xl shadow-2xs transition-all text-left text-xs font-semibold text-slate-800 cursor-pointer shrink-0"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                <div className="w-5.5 h-5.5 rounded-full bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-[10px] shrink-0 border border-purple-200">
                  {activeItem.borrowerInitial}
                </div>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="truncate font-bold text-slate-900 leading-tight text-[11px] sm:text-xs" title={activeItem.dropdownTitle}>
                    {activeItem.dropdownTitle}
                  </p>
                  <p className="truncate text-[9.5px] sm:text-[10px] text-purple-600 font-bold">
                    ₹{activeItem.principalAmount.toLocaleString('en-IN')} • {activeItem.sanctionDateStr}
                  </p>
                </div>
              </div>
              <ChevronDown className={cn("w-3 h-3 text-slate-400 shrink-0 ml-0.5 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsDropdownOpen(false)} 
                />
                <div className="absolute right-0 top-full mt-1.5 w-72 sm:w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-1.5 border-b border-slate-100">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search active member or loan..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-purple-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-slate-50 py-1">
                    {filteredDropdownItems.length === 0 ? (
                      <p className="text-center py-4 text-xs text-slate-400">No matching active loans found</p>
                    ) : (
                      filteredDropdownItems.map((item) => {
                        const isSelected = item.id === activeItem.id;
                        const isMulti = item.memberActiveLoansCount > 1;

                        return (
                          <button
                            key={`dropdown-loan-${item.id}`}
                            type="button"
                            onClick={() => {
                              handleSelectLoan(item.id);
                              setIsDropdownOpen(false);
                              setSearchQuery('');
                            }}
                            className={cn(
                              "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl text-left transition-colors cursor-pointer",
                              isSelected ? "bg-purple-50 text-purple-900 font-bold" : "hover:bg-slate-50 text-slate-700"
                            )}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 border",
                                isSelected 
                                  ? "bg-purple-600 text-white border-purple-700 shadow-xs" 
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              )}>
                                {item.borrowerInitial}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-xs leading-tight font-bold">{item.dropdownTitle}</p>
                                <p className="truncate text-[9.5px] text-slate-500 font-normal">
                                  ₹{item.principalAmount.toLocaleString('en-IN')} • Disbursed {item.sanctionDateStr}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase",
                                isMulti 
                                  ? "bg-indigo-100 text-indigo-800 border border-indigo-200" 
                                  : "bg-purple-100 text-purple-800 border border-purple-200"
                              )}>
                                {item.activeLabel}
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
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title={isCollapsed ? "Expand Breakdown" : "Collapse Breakdown"}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isCollapsed && "-rotate-90")} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="pt-3 space-y-3">
          {/* KPI Stat Cards for the Selected Active Loan - 4 Cards styled cleanly like Loan Repayment tab */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {/* Card 1: Sanctioned Loan (Purple/Indigo) */}
            <div className="bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-white p-3 sm:p-3.5 rounded-2xl shadow-xs border-2 border-indigo-200/90 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-xl bg-indigo-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <span className="text-[9.5px] sm:text-[10px] font-bold text-indigo-700 bg-indigo-100/90 border border-indigo-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {activeItem.totalInstallments} Mos • {activeItem.activeLabel}
                  </span>
                </div>
                <h4 className="text-indigo-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Sanctioned Loan</h4>
                <div className="mt-0.5 text-lg sm:text-xl md:text-2xl font-black text-indigo-950 tracking-tight truncate">
                  ₹{activeItem.principalAmount.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-indigo-100/90 flex items-center justify-between text-[10px] sm:text-[10.5px]">
                <span className="font-semibold text-slate-500">Disbursed:</span>
                <span className="font-bold text-indigo-700 truncate max-w-[130px]" title={activeItem.sanctionDateStr}>
                  {activeItem.sanctionDateStr}
                </span>
              </div>
            </div>

            {/* Card 2: Total Repaid (Emerald) */}
            <div className="bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white p-3 sm:p-3.5 rounded-2xl shadow-xs border-2 border-emerald-200/90 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-xl bg-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <span className="text-[9.5px] sm:text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {activeItem.repaymentProgress}% Paid
                  </span>
                </div>
                <h4 className="text-emerald-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Total Repaid</h4>
                <div className="mt-0.5 text-lg sm:text-xl md:text-2xl font-black text-emerald-700 tracking-tight truncate">
                  ₹{activeItem.totalPaid.toLocaleString('en-IN')}
                </div>
                <div className="w-full bg-emerald-200/60 h-1.5 rounded-full mt-1.5 overflow-hidden">
                  <div 
                    className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${activeItem.repaymentProgress}%` }}
                  />
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-emerald-100/90 flex items-center justify-between text-[9.5px] sm:text-[10px] font-semibold gap-1">
                <span className="text-emerald-800 truncate">
                  Principal: <strong className="font-bold">₹{activeItem.totalPrincipalPaid.toLocaleString('en-IN')}</strong>
                </span>
                <span className="text-amber-800 truncate">
                  Interest: <strong className="font-bold">₹{activeItem.totalInterestPaid.toLocaleString('en-IN')}</strong>
                </span>
              </div>
            </div>

            {/* Card 3: Next Installment (Blue/Amber) */}
            <div className="bg-gradient-to-br from-blue-50/90 via-blue-50/40 to-white p-3 sm:p-3.5 rounded-2xl shadow-xs border-2 border-blue-200/90 hover:border-blue-400 hover:shadow-md hover:shadow-blue-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-xl bg-blue-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <span className="text-[9.5px] sm:text-[10px] font-bold text-blue-700 bg-blue-100/90 border border-blue-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {activeItem.nextInstallment ? `Inst #${activeItem.nextInstallment.installmentNumber} Due` : 'Due'}
                  </span>
                </div>
                <h4 className="text-blue-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Next Installment</h4>
                <div className="mt-0.5 text-lg sm:text-xl md:text-2xl font-black text-blue-950 tracking-tight truncate">
                  {activeItem.nextInstallment ? `₹${activeItem.nextInstallment.total.toLocaleString('en-IN')}` : '₹0'}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-blue-100/90 flex items-center justify-between text-[10px] sm:text-[10.5px]">
                <span className="font-semibold text-slate-500">Upcoming:</span>
                <span 
                  className="font-bold text-blue-700 truncate max-w-[130px] sm:max-w-[150px]" 
                  title={activeItem.nextInstallment ? `${activeItem.nextInstallment.periodLabel}: Principal ₹${activeItem.nextInstallment.principal} + Interest ₹${activeItem.nextInstallment.interest}` : 'No dues'}
                >
                  {activeItem.nextInstallment 
                    ? `${activeItem.nextInstallment.periodLabel} (₹${activeItem.nextInstallment.principal}+₹${activeItem.nextInstallment.interest})` 
                    : 'Completed'}
                </span>
              </div>
            </div>

            {/* Card 4: Outstanding Balance (Rose) */}
            <div className="bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white p-3 sm:p-3.5 rounded-2xl shadow-xs border-2 border-rose-200/90 hover:border-rose-400 hover:shadow-md hover:shadow-rose-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2">
                  <div className="w-7 h-7 sm:w-7.5 sm:h-7.5 rounded-xl text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform bg-rose-600">
                    <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <span className="text-[9.5px] sm:text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border text-rose-700 bg-rose-100/90 border-rose-200">
                    Principal Due
                  </span>
                </div>
                <h4 className="text-rose-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Outstanding Balance</h4>
                <div className="mt-0.5 text-lg sm:text-xl md:text-2xl font-black text-rose-700 tracking-tight truncate">
                  ₹{activeItem.remainingPrincipal.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="mt-2 pt-2 border-t border-rose-100/90 flex items-center justify-between text-[10px] sm:text-[10.5px]">
                <span className="font-semibold text-slate-500">Balance:</span>
                <span className="font-bold text-rose-700">
                  Principal Due
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
