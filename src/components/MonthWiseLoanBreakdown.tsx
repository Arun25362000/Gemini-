import React, { useState, useMemo } from 'react';
import { 
  Calendar, ChevronDown, ChevronRight, User, HandCoins, CheckCircle2, Clock, 
  Search, Layers, ArrowUpRight, ShieldCheck, Wallet, X, ArrowUp, ArrowDown, ArrowUpDown
} from 'lucide-react';
import { Loan, LoanPayment, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { MobileQuickSort, MobileSortOption } from './MobileQuickSort';

export interface MonthLoanItem {
  loan: Loan;
  memberName: string;
  memberEmail: string;
  memberPhone?: string;
  amount: number;
  date: Date;
  repaidPrincipal: number;
  repaidInterest: number;
  remainingPrincipal: number;
  nextPaymentDateStr: string;
  nextPrincipal: number;
  nextInterest: number;
  nextTotalAmount: number;
  closedDateStr: string;
  status: 'approved' | 'paid';
}

interface MonthWiseLoanBreakdownProps {
  loans: Loan[];
  loanPayments: LoanPayment[];
  allUsers: UserProfile[];
  isAndroid?: boolean;
  searchQuery?: string;
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const MonthWiseLoanBreakdown: React.FC<MonthWiseLoanBreakdownProps> = ({
  loans,
  loanPayments,
  allUsers,
  isAndroid = false,
  searchQuery
}) => {
  const [searchTerm, setSearchTerm] = useState(searchQuery || '');

  React.useEffect(() => {
    if (searchQuery !== undefined) {
      setSearchTerm(searchQuery);
    }
  }, [searchQuery]);
  const [expandedYears, setExpandedYears] = useState<Record<number, boolean>>({});
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});
  const [sortConfig, setSortConfig] = useState<{
    field: 'date' | 'member' | 'amount' | 'totalPaid' | 'balance' | 'nextDate' | 'nextAmount' | 'closedDate' | 'status';
    direction: 'asc' | 'desc';
  }>({ field: 'date', direction: 'desc' });

  const handleSort = (field: 'date' | 'member' | 'amount' | 'totalPaid' | 'balance' | 'nextDate' | 'nextAmount' | 'closedDate' | 'status') => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const getSortedMonthLoans = (items: MonthLoanItem[]) => {
    return [...items].sort((a, b) => {
      switch (sortConfig.field) {
        case 'member':
          return sortConfig.direction === 'asc' 
            ? a.memberName.localeCompare(b.memberName) 
            : b.memberName.localeCompare(a.memberName);
        case 'amount':
          return sortConfig.direction === 'asc' ? a.amount - b.amount : b.amount - a.amount;
        case 'totalPaid':
          const totalA = a.repaidPrincipal + a.repaidInterest;
          const totalB = b.repaidPrincipal + b.repaidInterest;
          return sortConfig.direction === 'asc' ? totalA - totalB : totalB - totalA;
        case 'balance':
          return sortConfig.direction === 'asc' ? a.remainingPrincipal - b.remainingPrincipal : b.remainingPrincipal - a.remainingPrincipal;
        case 'nextDate':
          return sortConfig.direction === 'asc' 
            ? a.nextPaymentDateStr.localeCompare(b.nextPaymentDateStr) 
            : b.nextPaymentDateStr.localeCompare(a.nextPaymentDateStr);
        case 'nextAmount':
          return sortConfig.direction === 'asc' ? a.nextTotalAmount - b.nextTotalAmount : b.nextTotalAmount - a.nextTotalAmount;
        case 'closedDate':
          return sortConfig.direction === 'asc'
            ? a.closedDateStr.localeCompare(b.closedDateStr)
            : b.closedDateStr.localeCompare(a.closedDateStr);
        case 'status':
          return sortConfig.direction === 'asc' 
            ? a.status.localeCompare(b.status) 
            : b.status.localeCompare(a.status);
        case 'date':
        default:
          return sortConfig.direction === 'asc' 
            ? a.date.getTime() - b.date.getTime() 
            : b.date.getTime() - a.date.getTime();
      }
    });
  };

  // Helper to extract loan sanctioned/approved date
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

  // 1. Filter only sanctioned/disbursed loans (approved or paid)
  const sanctionedLoans = useMemo(() => {
    return loans.filter(l => l.status === 'approved' || l.status === 'paid');
  }, [loans]);

  // 2. Prepare structured data grouped by Year -> Month -> Loans
  const hierarchyData = useMemo(() => {
    type LoanItem = {
      loan: Loan;
      memberName: string;
      memberEmail: string;
      memberPhone?: string;
      amount: number;
      date: Date;
      repaidPrincipal: number;
      repaidInterest: number;
      remainingPrincipal: number;
      nextPaymentDateStr: string;
      nextPrincipal: number;
      nextInterest: number;
      nextTotalAmount: number;
      closedDateStr: string;
      status: 'approved' | 'paid';
    };

    type MonthGroup = {
      monthKey: string;
      month: number;
      year: number;
      monthName: string;
      totalDisbursed: number;
      totalRepaid: number;
      loans: LoanItem[];
    };

    type YearGroup = {
      year: number;
      totalDisbursed: number;
      totalRepaid: number;
      totalLoansCount: number;
      months: MonthGroup[];
    };

    const yearMap: Record<number, Record<number, LoanItem[]>> = {};

    sanctionedLoans.forEach((loan, idx) => {
      const date = getLoanSanctionDate(loan);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;

      // Find user info
      const user = allUsers.find(u => 
        (u.uid && loan.userId && u.uid === loan.userId) || 
        (u.email && loan.userEmail && u.email.toLowerCase() === loan.userEmail.toLowerCase())
      );
      let memberName = user?.displayName || (loan as any).userName || loan.userEmail?.split('@')[0] || `Member ${idx + 1}`;
      memberName = memberName.split(/[@(]/)[0].trim();
      const memberEmail = user?.email || loan.userEmail || '';
      const memberPhone = user?.phoneNumber || '';

      const amount = loan.approvedAmount || loan.amount || 0;

      // Calculate repaid amount for this loan
      const payments = loanPayments.filter(p => p.loanId === loan.id && p.status === 'paid');
      const repaidPrincipal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
      const repaidInterest = payments.reduce((sum, p) => sum + (p.interest || 0), 0);
      const remainingPrincipal = Math.max(0, amount - repaidPrincipal);

      const isFullySettled = loan.status === 'paid' || remainingPrincipal <= 0;
      let nextPaymentDateStr = '-';
      let nextPrincipal = 0;
      let nextInterest = 0;
      let nextTotalAmount = 0;
      let closedDateStr = '-';

      if (isFullySettled) {
        if (payments.length > 0) {
          const sortedPayments = [...payments].sort((a, b) => {
            const timeA = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0);
            const timeB = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0);
            if (timeB !== timeA) return timeB - timeA;
            return ((b.year || 0) * 100 + (b.month || 0)) - ((a.year || 0) * 100 + (a.month || 0));
          });
          const lastPayment = sortedPayments[0];
          if (lastPayment?.timestamp?.toDate) {
            closedDateStr = lastPayment.timestamp.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          } else if (lastPayment?.timestamp?.seconds) {
            closedDateStr = new Date(lastPayment.timestamp.seconds * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          } else if (lastPayment?.month && lastPayment?.year) {
            closedDateStr = new Date(lastPayment.year, lastPayment.month - 1, 10).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
          }
        } else if ((loan as any).closedAt?.toDate) {
          closedDateStr = (loan as any).closedAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } else if ((loan as any).paidAt?.toDate) {
          closedDateStr = (loan as any).paidAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        } else if ((loan as any).updatedAt?.toDate) {
          closedDateStr = (loan as any).updatedAt.toDate().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        }
      }

      if (!isFullySettled) {
        const totalInstallments = loan.installments || 10;
        const standardMonthlyPrincipal = Math.round(amount / totalInstallments);
        nextPrincipal = Math.min(remainingPrincipal, standardMonthlyPrincipal);
        nextInterest = Math.round(remainingPrincipal * 0.005);
        nextTotalAmount = nextPrincipal + nextInterest;

        // Due date calculation: 10th of next installment month
        const nextDueDate = new Date(date.getFullYear(), date.getMonth() + payments.length + 1, 10);
        nextPaymentDateStr = nextDueDate.toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric'
        });
      }

      if (!yearMap[year]) {
        yearMap[year] = {};
      }
      if (!yearMap[year][month]) {
        yearMap[year][month] = [];
      }

      yearMap[year][month].push({
        loan,
        memberName,
        memberEmail,
        memberPhone,
        amount,
        date,
        repaidPrincipal,
        repaidInterest,
        remainingPrincipal,
        nextPaymentDateStr,
        nextPrincipal,
        nextInterest,
        nextTotalAmount,
        closedDateStr,
        status: loan.status as 'approved' | 'paid'
      });
    });

    const result: YearGroup[] = [];

    // Sort years descending
    const sortedYears = Object.keys(yearMap).map(Number).sort((a, b) => b - a);

    sortedYears.forEach(year => {
      const monthMap = yearMap[year];
      const sortedMonths = Object.keys(monthMap).map(Number).sort((a, b) => b - a);

      let yearDisbursed = 0;
      let yearRepaid = 0;
      let yearLoansCount = 0;
      const monthsList: MonthGroup[] = [];

      sortedMonths.forEach(month => {
        const rawLoans = monthMap[month];
        
        // Filter by search term if active
        const filteredLoans = rawLoans.filter(item => {
          if (!searchTerm.trim()) return true;
          const term = searchTerm.trim().toLowerCase();
          const digitsOnly = term.replace(/\D/g, '');
          
          // Member Name, Email & Phone
          if (item.memberName.toLowerCase().includes(term)) return true;
          if (item.memberEmail.toLowerCase().includes(term)) return true;
          if (item.memberPhone && item.memberPhone.toLowerCase().includes(term)) return true;

          // Status search (active, settled, paid, approved, completed)
          const isPaid = item.status === 'paid';
          if (item.status.toLowerCase().includes(term)) return true;
          if (isPaid && (term.includes('settl') || term === 'paid' || term === 'completed')) return true;
          if (!isPaid && (term.includes('activ') || term === 'pending' || term === 'approved')) return true;

          // Date search
          const formattedDate = item.date.toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
          }).toLowerCase();
          if (formattedDate.includes(term)) return true;

          // Numeric search for amounts (digits only check)
          if (digitsOnly) {
            if (item.amount.toString().includes(digitsOnly)) return true;
            if (item.repaidPrincipal.toString().includes(digitsOnly)) return true;
            if (item.repaidInterest.toString().includes(digitsOnly)) return true;
            if (item.remainingPrincipal.toString().includes(digitsOnly)) return true;
            if (item.nextTotalAmount.toString().includes(digitsOnly)) return true;
          }

          // Formatted amount strings with Indian numbering and currency symbol
          const amountsToCheck = [
            item.amount.toString(),
            item.repaidPrincipal.toString(),
            item.repaidInterest.toString(),
            item.remainingPrincipal.toString(),
            item.nextTotalAmount.toString(),
            item.amount.toLocaleString('en-IN'),
            item.repaidPrincipal.toLocaleString('en-IN'),
            item.repaidInterest.toLocaleString('en-IN'),
            item.remainingPrincipal.toLocaleString('en-IN'),
            item.nextTotalAmount.toLocaleString('en-IN'),
            `₹${item.amount.toLocaleString('en-IN')}`,
            `₹${item.repaidPrincipal.toLocaleString('en-IN')}`,
            `₹${item.repaidInterest.toLocaleString('en-IN')}`,
            `₹${item.remainingPrincipal.toLocaleString('en-IN')}`,
            `₹${item.nextTotalAmount.toLocaleString('en-IN')}`,
            item.nextPaymentDateStr
          ];

          if (amountsToCheck.some(a => a.toLowerCase().includes(term))) return true;

          return false;
        });

        if (filteredLoans.length > 0) {
          const monthDisbursed = filteredLoans.reduce((sum, l) => sum + l.amount, 0);
          const monthRepaid = filteredLoans.reduce((sum, l) => sum + l.repaidPrincipal, 0);

          yearDisbursed += monthDisbursed;
          yearRepaid += monthRepaid;
          yearLoansCount += filteredLoans.length;

          monthsList.push({
            monthKey: `${year}-${String(month).padStart(2, '0')}`,
            month,
            year,
            monthName: `${MONTH_NAMES[month]} ${year}`,
            totalDisbursed: monthDisbursed,
            totalRepaid: monthRepaid,
            loans: filteredLoans.sort((a, b) => b.date.getTime() - a.date.getTime())
          });
        }
      });

      if (monthsList.length > 0) {
        result.push({
          year,
          totalDisbursed: yearDisbursed,
          totalRepaid: yearRepaid,
          totalLoansCount: yearLoansCount,
          months: monthsList
        });
      }
    });

    return result;
  }, [sanctionedLoans, allUsers, loanPayments, searchTerm]);

  const hasInitializedRef = React.useRef(false);

  // Initialize expanded states on first load
  React.useEffect(() => {
    if (hierarchyData.length > 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const yearsObj: Record<number, boolean> = {};
      const monthsObj: Record<string, boolean> = {};

      hierarchyData.forEach(yg => {
        yearsObj[yg.year] = true;
        yg.months.forEach(mg => {
          monthsObj[mg.monthKey] = true;
        });
      });

      setExpandedYears(yearsObj);
      setExpandedMonths(monthsObj);
    }
  }, [hierarchyData]);

  // Auto-expand all matching years and months when searching so results are immediately visible
  React.useEffect(() => {
    if (searchTerm.trim() && hierarchyData.length > 0) {
      const yearsObj: Record<number, boolean> = {};
      const monthsObj: Record<string, boolean> = {};
      hierarchyData.forEach(yg => {
        yearsObj[yg.year] = true;
        yg.months.forEach(mg => {
          monthsObj[mg.monthKey] = true;
        });
      });
      setExpandedYears(yearsObj);
      setExpandedMonths(monthsObj);
    }
  }, [searchTerm, hierarchyData]);

  const toggleYear = (year: number) => {
    setExpandedYears(prev => ({
      ...prev,
      [year]: prev[year] !== undefined ? !prev[year] : false
    }));
  };

  const toggleMonth = (monthKey: string) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: prev[monthKey] !== undefined ? !prev[monthKey] : false
    }));
  };

  const handleExpandAll = () => {
    const yearsObj: Record<number, boolean> = {};
    const monthsObj: Record<string, boolean> = {};
    hierarchyData.forEach(yg => {
      yearsObj[yg.year] = true;
      yg.months.forEach(mg => {
        monthsObj[mg.monthKey] = true;
      });
    });
    setExpandedYears(yearsObj);
    setExpandedMonths(monthsObj);
  };

  const handleCollapseAll = () => {
    const yearsObj: Record<number, boolean> = {};
    const monthsObj: Record<string, boolean> = {};
    hierarchyData.forEach(yg => {
      yearsObj[yg.year] = false;
      yg.months.forEach(mg => {
        monthsObj[mg.monthKey] = false;
      });
    });
    setExpandedYears(yearsObj);
    setExpandedMonths(monthsObj);
  };

  const totalAllDisbursed = useMemo(() => {
    return hierarchyData.reduce((sum, yg) => sum + yg.totalDisbursed, 0);
  }, [hierarchyData]);

  const totalAllLoans = useMemo(() => {
    return hierarchyData.reduce((sum, yg) => sum + yg.totalLoansCount, 0);
  }, [hierarchyData]);

  return (
    <div className={cn("space-y-6", isAndroid && "space-y-4")}>
      
      {/* Header & Metric Ribbon (styled identically to Monthly Loan Collection Verification) */}
      <div className="bg-gradient-to-r from-indigo-50/90 via-slate-50 to-white text-slate-900 rounded-3xl p-6 shadow-sm border border-indigo-100/90">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-indigo-100/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-11 sm:h-11 bg-indigo-100 rounded-2xl flex items-center justify-center border border-indigo-200 text-indigo-600 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-lg text-slate-900">Loan Breakdown Details</h3>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  Live
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Hierarchical year-wise and month-wise record of all sanctioned loans
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              type="button"
              onClick={handleExpandAll}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-indigo-600 text-xs font-bold rounded-2xl transition-all shadow-xs"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={handleCollapseAll}
              className="px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-indigo-600 text-xs font-bold rounded-2xl transition-all shadow-xs"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mt-4 pt-1">
          <div className="relative w-full sm:w-96 group">
            <div className="relative flex items-center bg-gradient-to-r from-white via-indigo-50/25 to-white border-2 border-indigo-200/90 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-100 rounded-2xl shadow-xs transition-all">
              <Search className="w-4 h-4 text-indigo-600 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none group-hover:scale-110 transition-transform" />
              <input
                type="text"
                placeholder="Search member, amount, repaid, balance, or status..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 bg-transparent border-0 rounded-2xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-0"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-all"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            Showing <span className="font-bold text-slate-900">{hierarchyData.reduce((acc, y) => acc + y.totalLoansCount, 0)}</span> loan record(s)
          </div>
        </div>
      </div>

      {/* Year-wise and Month-wise Accordions */}
      {hierarchyData.length > 0 ? (
        <div className="space-y-5">
          {hierarchyData.map((yearGroup) => {
            const isYearExpanded = expandedYears[yearGroup.year] ?? true;

            return (
              <div 
                key={yearGroup.year} 
                className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden transition-all"
              >
                {/* Year Header Accordion Trigger */}
                <button
                  type="button"
                  onClick={() => toggleYear(yearGroup.year)}
                  className="w-full px-5 sm:px-7 py-4.5 sm:py-5 bg-gradient-to-r from-slate-50/90 to-slate-100/50 hover:from-slate-100 hover:to-slate-150 flex items-center justify-between border-b border-slate-200/80 transition-all text-left group select-none cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base sm:text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                          Year {yearGroup.year}
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {yearGroup.totalLoansCount} Loan{yearGroup.totalLoansCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">
                        {yearGroup.months.length} Active Month{yearGroup.months.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Sanctioned</p>
                      <p className="text-sm font-black text-indigo-700">₹{yearGroup.totalDisbursed.toLocaleString('en-IN')}</p>
                    </div>
                    <div className={cn(
                      "w-8 h-8 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center text-slate-600 group-hover:border-indigo-300 transition-all",
                      isYearExpanded && "bg-indigo-50 text-indigo-600 border-indigo-200"
                    )}>
                      <ChevronDown className={cn(
                        "w-4 h-4 transition-transform duration-200",
                        !isYearExpanded && "-rotate-90"
                      )} />
                    </div>
                  </div>
                </button>

                {/* Year Body: Month List */}
                {isYearExpanded && (
                  <div className="p-2 sm:p-6 space-y-3 sm:space-y-4 bg-slate-50/40">
                    {yearGroup.months.map((monthGroup) => {
                      const isMonthExpanded = expandedMonths[monthGroup.monthKey] ?? true;

                      return (
                        <div 
                          key={monthGroup.monthKey}
                          className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200 shadow-sm overflow-hidden"
                        >
                          {/* Month Header Accordion Trigger */}
                          <button
                            type="button"
                            onClick={() => toggleMonth(monthGroup.monthKey)}
                            className="w-full px-4 sm:px-6 py-3.5 sm:py-4 bg-slate-50/80 hover:bg-slate-100 flex items-center justify-between border-b border-slate-100 transition-all text-left select-none cursor-pointer group"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-7 h-7 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600">
                                <HandCoins className="w-3.5 h-3.5" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm sm:text-base text-slate-800 group-hover:text-violet-700 transition-colors">
                                  {monthGroup.monthName}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100/90 text-indigo-700 border border-indigo-200 shadow-xs">
                                  {monthGroup.loans.length} member{monthGroup.loans.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="text-xs sm:text-sm font-black text-violet-700 bg-violet-50 px-2.5 sm:px-3 py-1 rounded-xl border border-violet-100">
                                ₹{monthGroup.totalDisbursed.toLocaleString('en-IN')}
                              </span>
                              <div className="w-6 h-6 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-400 group-hover:text-slate-600">
                                <ChevronDown className={cn(
                                  "w-3.5 h-3.5 transition-transform duration-200",
                                  !isMonthExpanded && "-rotate-90"
                                )} />
                              </div>
                            </div>
                          </button>

                          {/* Month Body: Table & Cards */}
                          {isMonthExpanded && (
                            <div className="p-0 sm:p-0">
                              {/* Desktop Table View */}
                              <div className="hidden md:block overflow-x-auto w-full touch-pan-x overscroll-x-contain">
                                <table className="w-full min-w-[850px] text-left border-collapse whitespace-nowrap">
                                  <thead>
                                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                                      <th 
                                        rowSpan={2} 
                                        onClick={() => handleSort('date')}
                                        className="px-4 py-3 w-10 text-center border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center justify-center gap-1">
                                          #
                                          {sortConfig.field === 'date' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                          )}
                                        </div>
                                      </th>
                                      <th 
                                        rowSpan={2} 
                                        onClick={() => handleSort('member')}
                                        className="px-4 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          Member
                                          {sortConfig.field === 'member' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                          )}
                                        </div>
                                      </th>
                                      <th 
                                        rowSpan={2} 
                                        onClick={() => handleSort('amount')}
                                        className="px-4 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          Loan Amount
                                          {sortConfig.field === 'amount' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                          )}
                                        </div>
                                      </th>
                                      <th 
                                        rowSpan={2} 
                                        onClick={() => handleSort('totalPaid')}
                                        className="px-4 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          Total Paid
                                          {sortConfig.field === 'totalPaid' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                          )}
                                        </div>
                                      </th>
                                      <th 
                                        rowSpan={2} 
                                        onClick={() => handleSort('balance')}
                                        className="px-4 py-3 border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center gap-1.5">
                                          Loan Balance
                                          {sortConfig.field === 'balance' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                          )}
                                        </div>
                                      </th>
                                      <th colSpan={2} className="px-4 py-2 text-center border-b border-r border-slate-200 bg-indigo-50/60 text-indigo-700">Next Payment</th>
                                      <th 
                                        rowSpan={2} 
                                        onClick={() => handleSort('closedDate')}
                                        className="px-3.5 py-3 text-center border-r border-slate-200/60 cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center justify-center gap-1.5">
                                          Closed Date
                                          {sortConfig.field === 'closedDate' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                          )}
                                        </div>
                                      </th>
                                      <th 
                                        rowSpan={2} 
                                        onClick={() => handleSort('status')}
                                        className="px-4 py-3 text-center cursor-pointer hover:bg-slate-100 transition-colors group select-none"
                                      >
                                        <div className="flex items-center justify-center gap-1.5">
                                          Status
                                          {sortConfig.field === 'status' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-400" />
                                          )}
                                        </div>
                                      </th>
                                    </tr>
                                    <tr className="bg-slate-50/75 border-b border-slate-200/80 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                      <th 
                                        onClick={() => handleSort('nextDate')}
                                        className="px-3 py-2 bg-indigo-50/30 text-indigo-900 border-r border-slate-200/60 text-center cursor-pointer hover:bg-indigo-100/50 transition-colors group select-none"
                                      >
                                        <div className="flex items-center justify-center gap-1">
                                          Date
                                          {sortConfig.field === 'nextDate' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-indigo-600" /> : <ArrowDown className="w-2.5 h-2.5 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-2.5 h-2.5 text-indigo-300 group-hover:text-indigo-400" />
                                          )}
                                        </div>
                                      </th>
                                      <th 
                                        onClick={() => handleSort('nextAmount')}
                                        className="px-3 py-2 bg-indigo-50/30 text-indigo-900 border-r border-slate-200/60 text-center cursor-pointer hover:bg-indigo-100/50 transition-colors group select-none"
                                      >
                                        <div className="flex items-center justify-center gap-1">
                                          Principal + Interest
                                          {sortConfig.field === 'nextAmount' ? (
                                            sortConfig.direction === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-indigo-600" /> : <ArrowDown className="w-2.5 h-2.5 text-indigo-600" />
                                          ) : (
                                            <ArrowUpDown className="w-2.5 h-2.5 text-indigo-300 group-hover:text-indigo-400" />
                                          )}
                                        </div>
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 text-xs font-semibold text-slate-700">
                                    {getSortedMonthLoans(monthGroup.loans).map((item, lIdx) => {
                                      const isPaid = item.status === 'paid';

                                      return (
                                        <tr key={item.loan.id || lIdx} className="hover:bg-slate-50/70 transition-colors">
                                          <td className="px-4 py-3 text-center font-bold text-slate-400 border-r border-slate-200/60">
                                            {lIdx + 1}
                                          </td>
                                          <td className="px-4 py-3 border-r border-slate-200/60">
                                            <div className="flex items-center gap-3">
                                              <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 font-bold text-xs">
                                                {item.memberName.charAt(0).toUpperCase()}
                                              </div>
                                              <div>
                                                <p className="font-bold text-slate-900">{item.memberName}</p>
                                                <p className="text-[11px] text-slate-400 font-normal">{item.memberPhone || item.memberEmail}</p>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 border-r border-slate-200/60">
                                            <span className="text-sm font-black text-slate-900">
                                              ₹{item.amount.toLocaleString('en-IN')}
                                            </span>
                                          </td>
                                          <td className="px-4 py-3 border-r border-slate-200/60">
                                            <div className="flex flex-col">
                                              <span className="text-sm font-bold text-emerald-700">
                                                ₹{(item.repaidPrincipal + item.repaidInterest).toLocaleString('en-IN')}
                                              </span>
                                              <div className="flex items-center gap-1 mt-0.5 text-[11px] font-semibold">
                                                <span className="text-emerald-700">₹{item.repaidPrincipal.toLocaleString('en-IN')}</span>
                                                <span className="text-slate-400 font-normal">+</span>
                                                <span className="text-indigo-700">₹{item.repaidInterest.toLocaleString('en-IN')} Int</span>
                                              </div>
                                            </div>
                                          </td>
                                          <td className="px-4 py-3 border-r border-slate-200/60">
                                            <span className={cn(
                                              "font-bold",
                                              item.remainingPrincipal > 0 ? "text-amber-700" : "text-slate-400"
                                            )}>
                                              ₹{item.remainingPrincipal.toLocaleString('en-IN')}
                                            </span>
                                          </td>
                                          <td className="px-3 py-3 text-center border-r border-slate-200/60">
                                            {item.nextPaymentDateStr === '-' ? (
                                              <span className="text-slate-400 font-medium">-</span>
                                            ) : (
                                              <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md text-[11px]">
                                                {item.nextPaymentDateStr}
                                              </span>
                                            )}
                                          </td>
                                          <td className="px-3 py-3 text-center border-r border-slate-200/60">
                                            {item.status === 'paid' || item.remainingPrincipal <= 0 ? (
                                              <span className="text-slate-400 font-medium">-</span>
                                            ) : (
                                              <div className="flex flex-col items-center">
                                                <span className="font-black text-slate-900 text-xs">
                                                  ₹{item.nextTotalAmount.toLocaleString('en-IN')}
                                                </span>
                                                <div className="flex items-center gap-1 mt-0.5 text-[10.5px] font-semibold">
                                                  <span className="text-slate-700">₹{item.nextPrincipal.toLocaleString('en-IN')}</span>
                                                  <span className="text-slate-400 font-normal">+</span>
                                                  <span className="text-indigo-700">₹{item.nextInterest.toLocaleString('en-IN')} Int</span>
                                                </div>
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-3.5 py-3 text-center border-r border-slate-200/60">
                                            {isPaid || item.remainingPrincipal <= 0 ? (
                                              <span className="font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px]">
                                                {item.closedDateStr}
                                              </span>
                                            ) : (
                                              <span className="text-slate-400 font-medium">-</span>
                                            )}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                            <span className={cn(
                                              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border",
                                              isPaid 
                                                ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                                : "bg-amber-50 text-amber-700 border-amber-200"
                                            )}>
                                              {isPaid ? (
                                                <>
                                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                                  Settled
                                                </>
                                              ) : (
                                                <>
                                                  <Clock className="w-3 h-3 text-amber-600" />
                                                  Active
                                                </>
                                              )}
                                            </span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>

                              {/* Mobile / Tablet Card View */}
                              <div className="block md:hidden p-3 space-y-3.5">
                                <MobileQuickSort
                                  options={[
                                    { key: 'date', label: 'Date' },
                                    { key: 'member', label: 'Member' },
                                    { key: 'amount', label: 'Amount' },
                                    { key: 'totalPaid', label: 'Total Paid' },
                                    { key: 'balance', label: 'Balance' },
                                    { key: 'nextDate', label: 'Next Date' },
                                    { key: 'nextAmount', label: 'Next Amount' },
                                    { key: 'closedDate', label: 'Closed Date' },
                                    { key: 'status', label: 'Status' }
                                  ]}
                                  activeField={sortConfig.field}
                                  direction={sortConfig.direction}
                                  onSort={handleSort}
                                  className="mb-1"
                                />
                                {getSortedMonthLoans(monthGroup.loans).map((item, lIdx) => {
                                  const isPaid = item.status === 'paid';

                                  return (
                                    <div 
                                      key={item.loan.id || lIdx}
                                      className="bg-white rounded-3xl shadow-sm border border-slate-200/80 p-5 space-y-4 relative overflow-hidden"
                                    >
                                      <div className="absolute top-0 right-0 px-3 py-1 bg-slate-100 text-[10px] font-bold text-slate-400 rounded-bl-xl border-b border-l border-slate-200">
                                        #{lIdx + 1}
                                      </div>
                                      <div className="flex items-start justify-between gap-2 pr-8">
                                        <div className="flex items-center gap-3 min-w-0">
                                          <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-base shrink-0">
                                            {item.memberName.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="min-w-0">
                                            <h4 className="font-bold text-sm text-slate-900 truncate">{item.memberName}</h4>
                                            <p className="text-xs text-slate-500 truncate">{item.memberPhone || item.memberEmail || '-'}</p>
                                          </div>
                                        </div>
                                        <span className={cn(
                                          "px-2.5 py-1 rounded-full text-[10px] font-bold border shrink-0",
                                          isPaid 
                                            ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                            : "bg-amber-50 text-amber-700 border-amber-200"
                                        )}>
                                          {isPaid ? 'Settled' : 'Active'}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 gap-3 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-100 text-xs">
                                        <div>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Amount</p>
                                          <p className="font-black text-slate-900 text-sm mt-0.5">₹{item.amount.toLocaleString('en-IN')}</p>
                                        </div>
                                        <div>
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Loan Balance</p>
                                          <p className={cn(
                                            "font-bold text-sm mt-0.5",
                                            item.remainingPrincipal > 0 ? "text-amber-700" : "text-slate-400"
                                          )}>
                                            ₹{item.remainingPrincipal.toLocaleString('en-IN')}
                                          </p>
                                        </div>
                                        <div className="col-span-2 sm:col-span-1 pt-1 border-t border-slate-200/60 sm:border-t-0 sm:pt-0">
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Paid</p>
                                          <p className="font-bold text-emerald-700 text-sm mt-0.5">₹{(item.repaidPrincipal + item.repaidInterest).toLocaleString('en-IN')}</p>
                                          <div className="flex items-center gap-1 mt-0.5 text-[10px] font-semibold text-slate-500">
                                            <span className="text-emerald-700 font-bold">₹{item.repaidPrincipal.toLocaleString('en-IN')}</span>
                                            <span>+</span>
                                            <span className="text-indigo-700 font-bold">₹{item.repaidInterest.toLocaleString('en-IN')} Int</span>
                                          </div>
                                        </div>
                                        <div className="col-span-2 sm:col-span-1 pt-1 border-t border-slate-200/60 sm:border-t-0 sm:pt-0">
                                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                            {isPaid || item.remainingPrincipal <= 0 ? 'Closed Date' : 'Tenure'}
                                          </p>
                                          <p className="font-bold text-slate-800 text-xs sm:text-sm mt-0.5">
                                            {isPaid || item.remainingPrincipal <= 0 ? (
                                              <span className="text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                                {item.closedDateStr}
                                              </span>
                                            ) : (
                                              <span>{item.loan.installments || 10} Months</span>
                                            )}
                                          </p>
                                        </div>
                                      </div>

                                      {/* Next Payment Card Section */}
                                      <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-100 space-y-1.5">
                                        <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider">Next Payment</p>
                                        {isPaid || item.remainingPrincipal <= 0 ? (
                                          <p className="text-xs text-slate-400 font-medium">No upcoming payments (Settled)</p>
                                        ) : (
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white p-3 rounded-xl border border-indigo-100/80">
                                            <div>
                                              <p className="text-[10px] text-slate-400 font-bold uppercase">Due Date</p>
                                              <p className="text-xs font-bold text-slate-800">{item.nextPaymentDateStr}</p>
                                            </div>
                                            <div className="sm:text-right border-t sm:border-t-0 pt-1 sm:pt-0 border-slate-100">
                                              <p className="text-[10px] text-slate-400 font-bold uppercase">Next Installment</p>
                                              <p className="text-xs font-black text-slate-900">
                                                ₹{item.nextTotalAmount.toLocaleString('en-IN')}
                                              </p>
                                              <p className="text-[10px] text-slate-500 font-semibold">
                                                (₹{item.nextPrincipal.toLocaleString('en-IN')} + <span className="text-indigo-700 font-bold">₹{item.nextInterest.toLocaleString('en-IN')} Int</span>)
                                              </p>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center">
          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Disbursed Loans Found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            {searchTerm ? `No loans match your search "${searchTerm}".` : 'Once loans are approved and disbursed to members, year and month breakdowns will be displayed here.'}
          </p>
        </div>
      )}
    </div>
  );
};
