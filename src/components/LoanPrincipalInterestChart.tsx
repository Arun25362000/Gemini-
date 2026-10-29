import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { 
  CreditCard, CheckCircle2, Calendar, AlertCircle, ChevronDown, Search, Check, IndianRupee, Layers,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { Loan, LoanPayment, UserProfile } from '../types';
import { cn, getSafeMemberDisplayName } from '../lib/utils';

export interface LoanPrincipalInterestChartProps {
  loans: Loan[];
  loanPayments: LoanPayment[];
  allUsers: UserProfile[];
  selectedLoanId?: string | null;
  onSelectLoan?: (loanId: string) => void;
}

export const LoanPrincipalInterestChart: React.FC<LoanPrincipalInterestChartProps> = ({
  loans,
  loanPayments,
  allUsers,
  selectedLoanId,
  onSelectLoan
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');

  // Current calendar month & year for Monthly Collection reconciliation
  const now = new Date();
  const currentCalMonth = now.getMonth() + 1;
  const currentCalYear = now.getFullYear();
  const currentMonthShort = format(now, 'MMM');

  // Helper to extract loan sanctioned date
  const getLoanSanctionDate = (loan: Loan): Date => {
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

  // Helper: Core Unnati Rule - when a loan is sanctioned in a month, repayment starts next month
  const isLoanRepaymentStartingInFuture = (loan: Loan, targetMonth: number, targetYear: number): boolean => {
    const sanctionDate = getLoanSanctionDate(loan);
    const sMonth = sanctionDate.getMonth() + 1;
    const sYear = sanctionDate.getFullYear();
    return (sYear > targetYear) || (sYear === targetYear && sMonth >= targetMonth);
  };

  // Helper: Calculate chronological loan sequence number (L#1, L#2) for each member
  const getMemberLoanSequenceNumber = (targetLoan: Loan): number => {
    const targetUser = allUsers.find(u => 
      (targetLoan.userId && u.uid === targetLoan.userId) || 
      (targetLoan.userEmail && u.email && u.email.toLowerCase().trim() === targetLoan.userEmail.toLowerCase().trim())
    );
    const memberLoans = loans.filter(l => 
      (l.status === 'approved' || l.status === 'paid') && (
        (targetUser && targetUser.uid && l.userId === targetUser.uid) ||
        (targetLoan.userId && l.userId === targetLoan.userId) ||
        (targetLoan.userEmail && l.userEmail && l.userEmail.toLowerCase().trim() === targetLoan.userEmail.toLowerCase().trim())
      )
    );

    const sorted = [...memberLoans].sort((a, b) => {
      const timeA = getLoanSanctionDate(a).getTime();
      const timeB = getLoanSanctionDate(b).getTime();
      return timeA - timeB;
    });

    const idx = sorted.findIndex(l => l.id === targetLoan.id);
    return idx >= 0 ? idx + 1 : 1;
  };

  // Filter ONLY active loans (approved and outstanding balance > 0, excluding settled/paid)
  const activeLoans = useMemo(() => {
    return loans.filter(l => {
      if (l.status !== 'approved') return false;
      const payments = loanPayments.filter(p => p.loanId === l.id && p.status === 'paid');
      const repaidPrincipal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const sanctionedAmount = l.approvedAmount || l.amount || 0;
      const remaining = sanctionedAmount - repaidPrincipal;
      return remaining > 0;
    });
  }, [loans, loanPayments]);

  // Determine currently selected active loan (default to first active loan if none selected or if selected is settled)
  const [internalSelectedLoanId, setInternalSelectedLoanId] = useState<string | null>(null);
  const activeLoanId = selectedLoanId || internalSelectedLoanId;

  const currentLoan = useMemo(() => {
    if (activeLoans.length === 0) return null;
    if (activeLoanId) {
      const found = activeLoans.find(l => l.id === activeLoanId);
      if (found) return found;
    }
    return activeLoans[0];
  }, [activeLoans, activeLoanId]);

  const currentLoanIndex = useMemo(() => {
    if (!currentLoan) return -1;
    return activeLoans.findIndex(l => l.id === currentLoan.id);
  }, [activeLoans, currentLoan]);

  const handleSelectLoan = (loanId: string) => {
    setInternalSelectedLoanId(loanId);
    if (onSelectLoan) {
      onSelectLoan(loanId);
    }
  };

  const handlePrevLoan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeLoans.length === 0) return;
    const prevIdx = currentLoanIndex <= 0 ? activeLoans.length - 1 : currentLoanIndex - 1;
    handleSelectLoan(activeLoans[prevIdx].id);
  };

  const handleNextLoan = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeLoans.length === 0) return;
    const nextIdx = currentLoanIndex >= activeLoans.length - 1 ? 0 : currentLoanIndex + 1;
    handleSelectLoan(activeLoans[nextIdx].id);
  };

  // Monthly Collection Real-Time Counts for current collection month (Loan: Paid: <count>, Due: <count>)
  // Strictly matches the logic in Monthly Collection Summary ribbon
  const collectionCounts = useMemo(() => {
    const isPaymentBelongingToLoan = (p: LoanPayment, loan: Loan): boolean => {
      if (p.loanId) return p.loanId === loan.id;
      const isMatchUser = (loan.userId && p.userId === loan.userId) ||
        (loan.userEmail && p.userEmail && loan.userEmail.toLowerCase().trim() === p.userEmail.toLowerCase().trim());
      if (isMatchUser) return true;
      const pEmail = (p.userEmail || '').toLowerCase().trim();
      const lEmail = (loan.userEmail || '').toLowerCase().trim();
      const isPraneshP = pEmail.includes('pranesh') || p.userId === 'imp5eagibVcvtfD5qleX4ISC1Nj2';
      const isPraneshL = lEmail.includes('pranesh') || loan.userId === 'imp5eagibVcvtfD5qleX4ISC1Nj2';
      return Boolean(isPraneshP && isPraneshL);
    };

    const activeLoansForCollection = loans.filter(loan => {
      const hasPaymentThisMonth = loanPayments.some(p => 
        isPaymentBelongingToLoan(p, loan) &&
        p.month === currentCalMonth &&
        p.year === currentCalYear &&
        p.status === 'paid'
      );
      if (hasPaymentThisMonth) return true;

      if (loan.status === 'declined') return false;
      const principalAmount = loan.approvedAmount || loan.amount || 0;
      if (principalAmount <= 0) return false;

      // When a loan is recorded in a month, it cannot be due in the same month (starts next month)
      if (isLoanRepaymentStartingInFuture(loan, currentCalMonth, currentCalYear)) {
        return false;
      }

      // Principal repayments made strictly BEFORE current month
      const priorPayments = loanPayments.filter(p => {
        if (!isPaymentBelongingToLoan(p, loan) || p.status !== 'paid') return false;
        if (p.year && p.month) {
          return p.year < currentCalYear || (p.year === currentCalYear && p.month < currentCalMonth);
        }
        return false;
      });
      const priorPaidPrincipal = priorPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const remainingAtMonthStart = principalAmount - priorPaidPrincipal;

      return remainingAtMonthStart > 0;
    });

    const loanPaidCount = activeLoansForCollection.filter(loan => {
      return loanPayments.some(p => 
        isPaymentBelongingToLoan(p, loan) &&
        p.month === currentCalMonth &&
        p.year === currentCalYear &&
        p.status === 'paid'
      );
    }).length;

    const loanDueCount = Math.max(0, activeLoansForCollection.length - loanPaidCount);

    return {
      loanPaidCount,
      loanDueCount
    };
  }, [loans, loanPayments, currentCalMonth, currentCalYear]);

  // Helper to determine dropdown status for each active loan member: Paid, Due, or Starts next mo.
  const getLoanMonthStatus = (loan: Loan): { label: string; code: 'paid' | 'due' | 'future' } => {
    const isFuture = isLoanRepaymentStartingInFuture(loan, currentCalMonth, currentCalYear);
    if (isFuture) {
      return { label: 'Starts next mo.', code: 'future' };
    }

    const thisMonthPayment = loanPayments.find(p => 
      p.loanId === loan.id && 
      p.status === 'paid' && 
      p.month === currentCalMonth && 
      p.year === currentCalYear
    );

    if (thisMonthPayment) {
      return { label: 'Paid', code: 'paid' };
    }

    return { label: 'Due', code: 'due' };
  };

  // Compute stats for current active loan matching Monthly Collection
  const stats = useMemo(() => {
    if (!currentLoan) return null;

    const sanctionedAmount = currentLoan.approvedAmount || currentLoan.amount || 0;
    const payments = loanPayments.filter(p => p.loanId === currentLoan.id && p.status === 'paid');
    const repaidPrincipal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const repaidInterest = payments.reduce((sum, p) => sum + (p.interest || 0), 0);
    const totalPaid = repaidPrincipal + repaidInterest;
    const remainingPrincipal = Math.max(0, sanctionedAmount - repaidPrincipal);
    const totalTenure = currentLoan.installments || 10;

    const regularPayments = payments.filter(p => !p.isExtraPrincipal);
    const totalMonthsPaid = regularPayments.reduce((acc, p) => acc + (p.isAdvance && p.coveredMonths?.length ? p.coveredMonths.length : 1), 0);
    const remainingInstallmentsCount = Math.max(0, totalTenure - totalMonthsPaid);

    const sanctionedDate = getLoanSanctionDate(currentLoan);
    const sanctionedDateStr = format(sanctionedDate, 'dd-MMM-yyyy');

    // Next installment calculations
    const standardMonthlyPrincipal = 5000;
    const nextPrincipal = Math.min(remainingPrincipal, standardMonthlyPrincipal);
    const nextInterest = Math.round(remainingPrincipal * 0.005);
    const nextTotalAmount = nextPrincipal + nextInterest;

    const isStartsNextMonth = isLoanRepaymentStartingInFuture(currentLoan, currentCalMonth, currentCalYear);

    const nextDueDate = new Date(sanctionedDate.getFullYear(), sanctionedDate.getMonth() + totalMonthsPaid + 1, 10);
    const nextPaymentDateStr = format(nextDueDate, 'dd-MMM-yyyy');

    const loanSeqNum = getMemberLoanSequenceNumber(currentLoan);
    const currentMonthStatus = getLoanMonthStatus(currentLoan);

    // Member display info
    const borrower = allUsers.find(u => 
      (currentLoan.userId && u.uid === currentLoan.userId) || 
      (currentLoan.userEmail && u.email.toLowerCase() === currentLoan.userEmail.toLowerCase())
    );
    const memberName = getSafeMemberDisplayName(borrower || currentLoan.userEmail, borrower?.phoneNumber, borrower?.email);

    return {
      loan: currentLoan,
      loanSeqNum,
      memberName,
      currentMonthStatus,
      sanctionedAmount,
      sanctionedDateStr,
      isStartsNextMonth,
      repaidPrincipal,
      repaidInterest,
      totalPaid,
      remainingPrincipal,
      totalTenure,
      totalMonthsPaid,
      remainingInstallmentsCount,
      nextPrincipal,
      nextInterest,
      nextTotalAmount,
      nextPaymentDateStr
    };
  }, [currentLoan, loanPayments, allUsers, currentCalMonth, currentCalYear]);

  // Filtered dropdown list for search
  const filteredActiveLoans = useMemo(() => {
    if (!searchFilter.trim()) return activeLoans;
    const term = searchFilter.toLowerCase().trim();
    return activeLoans.filter((l) => {
      const borrower = allUsers.find(u => 
        (l.userId && u.uid === l.userId) || 
        (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase())
      );
      const name = getSafeMemberDisplayName(borrower || l.userEmail, borrower?.phoneNumber, borrower?.email).toLowerCase();
      const status = getLoanMonthStatus(l).label.toLowerCase();
      return name.includes(term) || status.includes(term) || (l.id && l.id.toLowerCase().includes(term));
    });
  }, [activeLoans, searchFilter, allUsers]);

  if (activeLoans.length === 0 || !stats) {
    return null;
  }

  // Render Status Badge Pill
  const renderStatusBadge = (statusInfo: { label: string; code: 'paid' | 'due' | 'future' }) => {
    if (statusInfo.code === 'paid') {
      return (
        <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
          Paid
        </span>
      );
    }
    if (statusInfo.code === 'due') {
      return (
        <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide bg-amber-100 text-amber-900 border border-amber-300 shadow-2xs">
          Due
        </span>
      );
    }
    return (
      <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide bg-sky-100 text-sky-800 border border-sky-300 shadow-2xs">
        Starts next mo.
      </span>
    );
  };

  return (
    <div className="bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white text-slate-900 rounded-3xl p-5 sm:p-6 shadow-sm border-2 border-indigo-200/90 transition-all mb-6">
      {/* Top Ribbon Header: Icon, Title, Details Badges, and Compact Dropdown */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4.5 border-b border-indigo-100/90">
        <div className="flex items-start sm:items-center gap-3.5">
          {/* Header Icon container matching Monthly Collection Summary */}
          <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-xs">
            <IndianRupee className="w-5 h-5" />
          </div>

          <div>
            {/* Ribbon Title matching Monthly Collection pattern */}
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-base sm:text-lg text-slate-900 flex items-center gap-2">
                Principal vs. Interest Recovery Analytics
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                0.5% Monthly
              </span>
            </div>

            {/* Loan Repayment Counts placed directly under the ribbon title label */}
            <div className="flex items-center gap-1.5 flex-nowrap shrink-0 mt-1.5 text-[11px] sm:text-xs">
              <span className="font-bold text-slate-700">{currentMonthShort} Loan Payments -</span>
              <span className="flex items-center gap-1 font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-300 px-1.5 sm:px-2 py-0.5 rounded-md shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" />
                Paid: {collectionCounts.loanPaidCount}
              </span>
              <span className="flex items-center gap-1 font-bold text-amber-800 bg-amber-100/80 border border-amber-300 px-1.5 sm:px-2 py-0.5 rounded-md shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
                Due: {collectionCounts.loanDueCount}
              </span>
            </div>

            {/* Member Details: Member Name + L#, (LN-XXXXXX), and Sanctioned Date come below */}
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap text-[11px] sm:text-xs font-medium mt-1.5">
              {/* Member Name + L# */}
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="font-bold text-slate-800 text-xs sm:text-sm">
                  {stats.memberName}
                </span>
                <span className="text-indigo-600 font-extrabold text-xs">
                  L#{stats.loanSeqNum}
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  (LN-{(stats.loan.id || '').slice(-6).toUpperCase()})
                </span>
              </div>

              <span className="text-slate-300 hidden sm:inline select-none">•</span>

              {/* Sanctioned Date */}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200/90 shadow-2xs font-semibold text-[11px]">
                <span className="text-sky-600 font-medium">Sanctioned Date:</span>
                <span className="font-bold text-sky-900">{stats.sanctionedDateStr}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Loan Member Traverser (1/X) & Compact Dropdown */}
        <div className="flex items-center gap-2 self-stretch lg:self-auto shrink-0 flex-wrap sm:flex-nowrap">
          {/* Previous / Next buttons traversing across active loans */}
          <div className="flex items-center bg-white border-2 border-indigo-200/90 rounded-xl shadow-2xs overflow-hidden shrink-0 h-[38px]">
            <button
              type="button"
              onClick={handlePrevLoan}
              className="px-2 h-full hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors border-r border-indigo-200/90 disabled:opacity-40 cursor-pointer flex items-center justify-center"
              title="Previous Active Loan Member"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 text-[11px] font-bold text-slate-700 select-none whitespace-nowrap">
              {currentLoanIndex + 1} / {activeLoans.length}
            </span>
            <button
              type="button"
              onClick={handleNextLoan}
              className="px-2 h-full hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-40 cursor-pointer flex items-center justify-center"
              title="Next Active Loan Member"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Compact Dropdown: Member name on left, colored box status right-aligned */}
          <div className="relative flex-1 min-w-[200px] sm:min-w-[240px] lg:min-w-[260px]">
            {/* Dropdown Trigger Button */}
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="w-full flex items-center justify-between gap-2.5 px-3.5 py-2 bg-white hover:bg-slate-50 border-2 border-indigo-200/90 hover:border-indigo-300 rounded-xl shadow-2xs transition-all text-left text-xs font-bold text-slate-800 cursor-pointer"
              title="Select Active Loan Member"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="truncate text-slate-900 font-bold">
                  {stats.memberName}
                </span>
                <span className="text-indigo-600 font-extrabold shrink-0 text-[11px]">
                  L#{stats.loanSeqNum}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {renderStatusBadge(stats.currentMonthStatus)}
                <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
              </div>
            </button>

            {/* Custom Dropdown Menu with Backdrop */}
            {isDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => {
                    setIsDropdownOpen(false);
                    setSearchFilter('');
                  }} 
                />
                <div className="absolute right-0 top-full mt-1.5 w-full sm:w-84 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 p-1.5 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                  {/* Search box if list has multiple members */}
                  {activeLoans.length > 4 && (
                    <div className="p-1.5 border-b border-slate-100">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search member..."
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-400"
                          autoFocus
                        />
                      </div>
                    </div>
                  )}

                  {/* List of Active Loan Members */}
                  <div className="max-h-64 overflow-y-auto divide-y divide-slate-50 py-1">
                    {filteredActiveLoans.length === 0 ? (
                      <p className="text-center py-3 text-xs text-slate-400 font-medium">No matching active loans</p>
                    ) : (
                      filteredActiveLoans.map((l) => {
                        const borrower = allUsers.find(u => 
                          (l.userId && u.uid === l.userId) || 
                          (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase())
                        );
                        const name = getSafeMemberDisplayName(borrower || l.userEmail, borrower?.phoneNumber, borrower?.email);
                        const statusInfo = getLoanMonthStatus(l);
                        const seq = getMemberLoanSequenceNumber(l);
                        const isSelected = stats.loan.id === l.id;

                        return (
                          <button
                            key={l.id}
                            type="button"
                            onClick={() => {
                              handleSelectLoan(l.id);
                              setIsDropdownOpen(false);
                              setSearchFilter('');
                            }}
                            className={cn(
                              "w-full flex items-center justify-between gap-3 px-3 py-2 text-left rounded-xl transition-all cursor-pointer group",
                              isSelected 
                                ? "bg-indigo-50/90 text-indigo-950 font-bold" 
                                : "hover:bg-slate-50 text-slate-700"
                            )}
                          >
                            {/* Left Side: Member Name and L# */}
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {isSelected && (
                                <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                              )}
                              <span className={cn("text-xs truncate", isSelected ? "font-black text-indigo-950" : "font-semibold text-slate-800")}>
                                {name}
                              </span>
                              <span className="text-indigo-600 font-extrabold text-[11px] shrink-0">
                                L#{seq}
                              </span>
                            </div>

                            {/* Right Side: Status Badge (Right Aligned) */}
                            <div className="shrink-0 ml-2">
                              {renderStatusBadge(statusInfo)}
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
        </div>
      </div>

      {/* 4 Cards Ribbon matching Monthly Collection / Loan Repayment color and pattern */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 mt-5">
        {/* Card 1: Principal (Purple) */}
        <div className="bg-gradient-to-br from-purple-50/90 via-purple-50/40 to-white p-4 rounded-2xl shadow-xs border-2 border-purple-200/90 hover:border-purple-400 hover:shadow-md hover:shadow-purple-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              <div className="w-7.5 h-7.5 rounded-xl bg-purple-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <CreditCard className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-100/90 border border-purple-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                Sanctioned
              </span>
            </div>
            <h4 className="text-purple-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Principal</h4>
            <div className="mt-0.5 text-xl sm:text-2xl font-black text-purple-950 tracking-tight truncate">
              ₹{stats.sanctionedAmount.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-purple-100/90 flex items-center justify-between text-[10.5px]">
            <span className="font-semibold text-slate-500">Tenure:</span>
            <span className="font-bold text-purple-700">{stats.totalTenure} Months (0.5%)</span>
          </div>
        </div>

        {/* Card 2: Total Paid (Emerald) */}
        <div className="bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white p-4 rounded-2xl shadow-xs border-2 border-emerald-200/90 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              <div className="w-7.5 h-7.5 rounded-xl bg-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                Recovered
              </span>
            </div>
            <h4 className="text-emerald-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Total Paid</h4>
            <div className="mt-0.5 text-xl sm:text-2xl font-black text-emerald-700 tracking-tight truncate">
              ₹{stats.totalPaid.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-emerald-100/90 flex items-center justify-between text-[10.5px]">
            <span className="font-semibold text-slate-500">Principal: ₹{stats.repaidPrincipal.toLocaleString('en-IN')}</span>
            <span className="font-bold text-emerald-700">Int: ₹{stats.repaidInterest.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Card 3: Next Installment (Indigo) */}
        <div className="bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-white p-4 rounded-2xl shadow-xs border-2 border-indigo-200/90 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              <div className="w-7.5 h-7.5 rounded-xl bg-indigo-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/90 border border-indigo-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                {stats.totalMonthsPaid}/{stats.totalTenure}
              </span>
            </div>
            <h4 className="text-indigo-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Next Installment</h4>
            <div className="mt-0.5 text-xl sm:text-2xl font-black text-indigo-700 tracking-tight truncate">
              ₹{stats.nextTotalAmount.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-indigo-100/90 flex items-center justify-between text-[10.5px]">
            <span className="font-semibold text-slate-500">
              {stats.isStartsNextMonth ? 'Starts Next Month' : `Due: ${stats.nextPaymentDateStr}`}
            </span>
            <span className="font-bold text-indigo-700">P: ₹{stats.nextPrincipal.toLocaleString('en-IN')} + I: ₹{stats.nextInterest.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {/* Card 4: Outstanding Balance (Rose) */}
        <div className="bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white p-4 rounded-2xl shadow-xs border-2 border-rose-200/90 hover:border-rose-400 hover:shadow-md hover:shadow-rose-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between gap-1.5 mb-2.5">
              <div className="w-7.5 h-7.5 rounded-xl bg-rose-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <AlertCircle className="w-4 h-4" />
              </div>
              <span className="text-[10px] font-bold text-rose-700 bg-rose-100/90 border border-rose-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                Pending
              </span>
            </div>
            <h4 className="text-rose-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Outstanding Balance</h4>
            <div className="mt-0.5 text-xl sm:text-2xl font-black text-rose-700 tracking-tight truncate">
              ₹{stats.remainingPrincipal.toLocaleString('en-IN')}
            </div>
          </div>
          <div className="mt-2.5 pt-2 border-t border-rose-100/90 flex items-center justify-between text-[10.5px]">
            <span className="font-semibold text-slate-500">Balance Due:</span>
            <span className="font-bold text-rose-700">{stats.remainingInstallmentsCount} Installments Left</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoanPrincipalInterestChart;
