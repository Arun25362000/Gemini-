import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, Cell
} from 'recharts';
import { HandCoins, TrendingUp, Calendar, CheckCircle2, Users, UserCheck, ChevronDown, ChevronUp, CircleDot, Wallet, FileSpreadsheet, Loader2, Layers } from 'lucide-react';
import { UserProfile, Contribution, Loan, LoanPayment } from '../types';
import { cn } from '../lib/utils';
import {
  exportGraphLoanSanctionsRepaymentsExcel,
  exportGraphMemberDisbursementsExcel,
  exportGraphMemberwiseBorrowedRepaidExcel,
  exportGraphFinancialHealthExcel,
  exportGraphMonthlyPaidCountsExcel,
  captureChartImage
} from '../lib/graphExcelExport';

interface GraphsProps {
  allUsers: UserProfile[];
  contributions: Contribution[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  financials: {
    totalSavings: number;
    availableBalance: number;
    outstandingPrincipal: number;
  };
  userEmail: string;
  isAdmin: boolean;
  selectedYear?: number;
  notify?: (type: 'success' | 'error' | 'info', message: string) => void;
}

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const isMobileApp = typeof window !== 'undefined' && 
  (window.location.hostname === 'localhost' || 
   window.location.protocol === 'file:' || 
   /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) &&
  !window.location.hostname.includes('asia-southeast1.run.app');

// Format value for top of bar graphs.
const formatBarAmountValue = (val: any): string => {
  const num = Number(val);
  if (!num || isNaN(num) || num <= 0) return '';
  
  if (num % 1000 !== 0) {
    return `₹${num.toLocaleString('en-IN')}`;
  }
  
  if (num >= 10000000 && num % 10000000 === 0) {
    return `₹${num / 10000000}Cr`;
  }
  if (num >= 100000 && num % 100000 === 0) {
    return `₹${num / 100000}L`;
  }
  if (num >= 1000) {
    const kVal = num / 1000;
    return `₹${kVal}k`;
  }
  return `₹${num.toLocaleString('en-IN')}`;
};

const Graphs: React.FC<GraphsProps> = ({ 
  allUsers, 
  contributions, 
  loans, 
  loanPayments, 
  financials, 
  userEmail, 
  isAdmin,
  selectedYear: propSelectedYear,
  notify
}) => {
  const [isMobileScreen, setIsMobileScreen] = React.useState(false);
  const [selectedLoanMonthFilter, setSelectedLoanMonthFilter] = React.useState<string>('all');
  const [collapsedGraphs, setCollapsedGraphs] = React.useState<Record<string, boolean>>({});
  const [exportingGraph, setExportingGraph] = React.useState<string | null>(null);

  const selectedYear = propSelectedYear || new Date().getFullYear();

  const toggleGraph = (id: string) => {
    setCollapsedGraphs(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isAndroid = isMobileApp || isMobileScreen;

  // Dynamic width calculator to guarantee bars don't squish when data items increase
  const getDynamicChartWidth = (itemCount: number) => {
    const minPerItem = isAndroid ? 65 : 85;
    const baseMin = isAndroid ? 300 : 480;
    return Math.max(baseMin, itemCount * minPerItem);
  };

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
    return new Date(2026, 0, 1);
  };

  // Sanctioned loans in selectedYear (both approved and closed/paid)
  const sanctionedLoansInYear = React.useMemo(() => {
    return loans.filter(l => {
      const isSanctioned = l.status === 'approved' || l.status === 'paid';
      if (!isSanctioned) return false;
      const sanctionYear = getLoanSanctionDate(l).getFullYear();
      return sanctionYear === selectedYear;
    });
  }, [loans, selectedYear]);

  // Paid loan payments in selectedYear
  const paidLoanPaymentsInYear = React.useMemo(() => {
    return loanPayments.filter(p => {
      if (p.status !== 'paid') return false;
      const pYear = p.year || (p.timestamp?.toDate ? p.timestamp.toDate().getFullYear() : new Date().getFullYear());
      return pYear === selectedYear;
    });
  }, [loanPayments, selectedYear]);

  const totalSanctionedSum = sanctionedLoansInYear.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
  const totalSanctionedCount = sanctionedLoansInYear.length;

  const totalRepaymentsSum = paidLoanPaymentsInYear.reduce((sum, p) => sum + (p.amount || 0) + (p.interest || 0), 0);
  const totalRepaymentsCount = paidLoanPaymentsInYear.length;

  // 1. Month-wise Sanctioned Loans & Repayments Data (for Admin)
  const monthlySanctionedLoansData = React.useMemo(() => {
    const map: Record<number, { 
      key: string; 
      name: string; 
      month: number; 
      year: number; 
      sanctionedAmount: number; 
      sanctionCount: number;
      repaidAmount: number;
      repaymentCount: number;
      repaymentPrincipal: number;
      repaymentInterest: number;
    }> = {};

    // Pre-populate all 12 calendar months for selectedYear so the chart timeline is always complete and rendered
    for (let m = 1; m <= 12; m++) {
      map[m] = {
        key: `${selectedYear}-${String(m).padStart(2, '0')}`,
        name: `${MONTH_NAMES[m]} ${selectedYear}`,
        month: m,
        year: selectedYear,
        sanctionedAmount: 0,
        sanctionCount: 0,
        repaidAmount: 0,
        repaymentCount: 0,
        repaymentPrincipal: 0,
        repaymentInterest: 0
      };
    }

    // 1. Accumulate Sanctioned Loans in selectedYear
    sanctionedLoansInYear.forEach(l => {
      const date = getLoanSanctionDate(l);
      const month = date.getMonth() + 1;
      const amount = l.approvedAmount || l.amount || 0;

      if (map[month]) {
        map[month].sanctionedAmount += amount;
        map[month].sanctionCount += 1;
      }
    });

    // 2. Accumulate Repayments Received in selectedYear
    paidLoanPaymentsInYear.forEach(p => {
      const month = p.month || (p.timestamp?.toDate ? p.timestamp.toDate().getMonth() + 1 : new Date().getMonth() + 1);
      const principal = p.amount || 0;
      const interest = p.interest || 0;
      const totalRepaid = principal + interest;

      if (map[month]) {
        map[month].repaidAmount += totalRepaid;
        map[month].repaymentCount += 1;
        map[month].repaymentPrincipal += principal;
        map[month].repaymentInterest += interest;
      }
    });

    return Object.values(map).sort((a, b) => a.month - b.month);
  }, [sanctionedLoansInYear, paidLoanPaymentsInYear, selectedYear]);

  // 2. Member vs Loan Received and Paid (Includes ALL Loans: Active & Closed)
  const memberLoans = React.useMemo(() => {
    const list = allUsers
      .filter(u => u.email?.toLowerCase() !== 'unnati.finance2026@gmail.com')
      .map((u, uidx) => {
        // Includes BOTH 'approved' (active) and 'paid' (closed) loans
        const userApprovedLoans = loans.filter(l => {
          const isUserMatch = (
            (l.userEmail && u.email && l.userEmail.toLowerCase() === u.email.toLowerCase()) || 
            (l.userId && u.uid && l.userId === u.uid)
          );
          const isStatusMatch = l.status === 'approved' || l.status === 'paid';
          const sanctionYear = getLoanSanctionDate(l).getFullYear();
          return isUserMatch && isStatusMatch && sanctionYear === selectedYear;
        });

        const totalLoansCount = userApprovedLoans.length;
        const activeLoanCount = userApprovedLoans.filter(l => l.status === 'approved').length;
        const closedLoanCount = userApprovedLoans.filter(l => l.status === 'paid').length;
        const totalBorrowed = userApprovedLoans.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
        
        const userYearPaidPayments = loanPayments
          .filter(p => {
            const loan = loans.find(l => l.id === p.loanId);
            const isUserLoan = (
              (loan?.userEmail && u.email && loan.userEmail.toLowerCase() === u.email.toLowerCase()) || 
              (loan?.userId && u.uid && loan.userId === u.uid)
            );
            const pYear = p.year || (p.timestamp?.toDate ? p.timestamp.toDate().getFullYear() : new Date().getFullYear());
            return isUserLoan && (loan?.status === 'approved' || loan?.status === 'paid') && p.status === 'paid' && pYear === selectedYear;
          });

        const totalPrincipalRepaid = userYearPaidPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalInterestPaid = userYearPaidPayments.reduce((sum, p) => sum + (p.interest || 0), 0);
        const totalRepaid = totalPrincipalRepaid + totalInterestPaid;

        const balancePrincipal = userApprovedLoans.reduce((sum, l) => {
          if (l.status === 'paid') return sum;
          const paidForThisLoan = loanPayments
            .filter(p => p.loanId === l.id && p.status === 'paid')
            .reduce((acc, p) => acc + (p.amount || 0), 0);
          return sum + Math.max(0, (l.approvedAmount || l.amount || 0) - paidForThisLoan);
        }, 0);

        const baseName = u.displayName || `Member ${uidx + 1}`;
        const uniqueId = `${u.uid || u.email || 'loan-user'}-${uidx}`;
        
        return {
          name: baseName,
          email: u.email?.toLowerCase(),
          uniqueId: uniqueId,
          borrowed: totalBorrowed,
          repaidPrincipal: totalPrincipalRepaid,
          interestPaid: totalInterestPaid,
          totalRepaid: totalRepaid,
          repaid: totalRepaid,
          balancePrincipal: balancePrincipal,
          totalLoans: totalLoansCount,
          activeLoans: activeLoanCount,
          closedLoans: closedLoanCount,
          displayNameWithActive: `${baseName} (${totalLoansCount})`
        };
      });

    // Filter to show ONLY members having loans (borrowed or repaid)
    const withLoans = list.filter(d => (d.borrowed > 0 || d.totalRepaid > 0));

    if (isAdmin) {
      return withLoans.sort((a, b) => (b.borrowed || 0) - (a.borrowed || 0) || a.name.localeCompare(b.name));
    }
    return withLoans.filter(d => d.email === userEmail.toLowerCase());
  }, [allUsers, loans, loanPayments, selectedYear, isAdmin, userEmail]);

  // 3. Member-wise Loan Disbursements by Month Data (for Admin) - Shows ONLY members with loan disbursements
  const memberLoansByMonth = React.useMemo(() => {
    const list: {
      id: string;
      memberId: string;
      memberName: string;
      email: string;
      amount: number;
      month: number;
      year: number;
      monthLabel: string;
      date: Date;
      status: 'approved' | 'paid';
      displayNameWithMonth: string;
      uniqueKey: string;
    }[] = [];

    sanctionedLoansInYear.forEach((l, idx) => {
      const date = getLoanSanctionDate(l);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const monthLabel = `${MONTH_NAMES[month]} ${year}`;
      const amount = l.approvedAmount || l.amount || 0;
      
      const user = allUsers.find(u => 
        (u.uid && l.userId && u.uid === l.userId) || 
        (u.email && l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase())
      );
      let memberName = user?.displayName || (l as any).userName || l.userEmail?.split('@')[0] || `Member ${idx + 1}`;
      memberName = memberName.split(/[@(]/)[0].trim();

      list.push({
        id: l.id || `loan-${idx}`,
        memberId: l.userId || l.userEmail || `mem-${idx}`,
        memberName,
        email: l.userEmail || '',
        amount,
        month,
        year,
        monthLabel,
        date,
        status: (l.status === 'paid' ? 'paid' : 'approved') as 'approved' | 'paid',
        displayNameWithMonth: `${memberName} (${MONTH_NAMES[month]} '${String(year).slice(-2)})`,
        uniqueKey: `${l.id || idx}-${memberName}-${month}-${year}`
      });
    });

    return list.sort((a, b) => (b.amount - a.amount) || a.date.getTime() - b.date.getTime() || a.memberName.localeCompare(b.memberName));
  }, [sanctionedLoansInYear, allUsers]);

  // Grouped by Month for Summary Filter Pills
  const loansGroupedByMonth = React.useMemo(() => {
    const groups: Record<string, {
      monthLabel: string;
      month: number;
      year: number;
      totalAmount: number;
      members: {
        id: string;
        name: string;
        amount: number;
        status: 'approved' | 'paid';
      }[];
    }> = {};

    memberLoansByMonth.forEach(item => {
      if (item.amount <= 0 || item.month <= 0) return;
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
      if (!groups[key]) {
        groups[key] = {
          monthLabel: item.monthLabel,
          month: item.month,
          year: item.year,
          totalAmount: 0,
          members: []
        };
      }
      groups[key].totalAmount += item.amount;
      groups[key].members.push({
        id: item.id,
        name: item.memberName,
        amount: item.amount,
        status: item.status
      });
    });

    return Object.values(groups).sort((a, b) => a.month - b.month);
  }, [memberLoansByMonth]);

  const availableLoanMonths = React.useMemo(() => {
    return loansGroupedByMonth.map(g => g.monthLabel);
  }, [loansGroupedByMonth]);

  const filteredMemberLoansByMonth = React.useMemo(() => {
    if (selectedLoanMonthFilter === 'all') {
      return memberLoansByMonth;
    }
    return memberLoansByMonth.filter(l => l.monthLabel === selectedLoanMonthFilter);
  }, [memberLoansByMonth, selectedLoanMonthFilter]);

  // 4. Financial Health Data for selectedYear
  const financialHealthData = React.useMemo(() => {
    // 1. Paid contributions in selectedYear
    const paidContributionsInYear = contributions
      .filter(c => c.year === selectedYear && c.status === 'paid')
      .reduce((sum, c) => sum + c.amount, 0);

    // Interest collected on repayments in selectedYear
    const paidInterestInYear = paidLoanPaymentsInYear
      .reduce((sum, p) => sum + (p.interest || 0), 0);

    // Total Group funds = contributions + interest collected
    const totalGroupFunds = paidContributionsInYear + paidInterestInYear;

    // 2. Loans sanctioned in selectedYear
    const loansSanctioned = sanctionedLoansInYear
      .reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);

    // 3. Loans Repaid (Principal repaid in selectedYear)
    const loansRepaid = paidLoanPaymentsInYear
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    // 4. Outstanding Loans = Sanctioned - Repaid (min 0)
    const outstandingLoans = Math.max(0, loansSanctioned - loansRepaid);

    // 5. Available balance = Total Group Funds - Outstanding Loans (min 0)
    const availableBalance = Math.max(0, totalGroupFunds - outstandingLoans);

    return {
      totalGroupFunds,
      loansSanctioned,
      loansRepaid,
      outstandingLoans,
      availableBalance,
      paidContributionsInYear,
      paidInterestInYear,
      chartData: [
        {
          key: 'totalFunds',
          category: 'Total Group Funds',
          baseAmount: paidContributionsInYear,
          interestAmount: paidInterestInYear,
          totalAmount: totalGroupFunds,
          fill: 'url(#healthTotalFundsGradient)',
          color: '#4f46e5',
          subtitle: 'Savings + Interest'
        },
        {
          key: 'loansSanctioned',
          category: 'Loans Sanctioned',
          baseAmount: loansSanctioned,
          interestAmount: 0,
          totalAmount: loansSanctioned,
          fill: 'url(#healthLoansSanctionedGradient)',
          color: '#8b5cf6',
          subtitle: 'Approved Principal'
        },
        {
          key: 'loansRepaid',
          category: 'Loans Repaid',
          baseAmount: loansRepaid,
          interestAmount: 0,
          totalAmount: loansRepaid,
          fill: 'url(#healthLoansRepaidGradient)',
          color: '#10b981',
          subtitle: 'Principal Recovered'
        },
        {
          key: 'outstandingLoans',
          category: 'Outstanding Loans',
          baseAmount: outstandingLoans,
          interestAmount: 0,
          totalAmount: outstandingLoans,
          fill: 'url(#healthOutstandingGradient)',
          color: '#f43f5e',
          subtitle: 'Active Balance Due'
        },
        {
          key: 'availableBalance',
          category: 'Available Balance',
          baseAmount: availableBalance,
          interestAmount: 0,
          totalAmount: availableBalance,
          fill: 'url(#healthAvailableGradient)',
          color: '#06b6d4',
          subtitle: 'Net Pool Liquidity'
        }
      ]
    };
  }, [contributions, sanctionedLoansInYear, paidLoanPaymentsInYear, selectedYear]);

  // 5. Month-wise Paid Collections: Subscriptions & Loans (matching Monthly Collection Summary exactly)
  const monthlyPaidCountsData = React.useMemo(() => {
    const now = new Date();
    const currentCalMonth = now.getMonth() + 1;
    const currentCalYear = now.getFullYear();

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

    const eligibleMembers = allUsers.filter(u => {
      const email = (u.email || '').toLowerCase().trim();
      const name = (u.displayName || '').toLowerCase().trim();
      if (email === 'unnati.finance2026@gmail.com' || email.includes('unnati.finance2026') || name === 'unnati') {
        return false;
      }
      return true;
    });

    const result = [];

    for (let m = 1; m <= 12; m++) {
      const isPastMonth = selectedYear < currentCalYear || (selectedYear === currentCalYear && m < currentCalMonth);
      const isCurrentMonth = selectedYear === currentCalYear && m === currentCalMonth;
      const isFutureMonth = selectedYear > currentCalYear || (selectedYear === currentCalYear && m > currentCalMonth);

      // Subscriptions Paid count for month m
      const monthlyPaidContribs = contributions.filter(c =>
        (c.status === 'paid' || !c.status) &&
        c.month === m &&
        c.year === selectedYear
      );

      const subscriptionPaidCount = eligibleMembers.filter(user => {
        return monthlyPaidContribs.some(c =>
          (c.userId && user.uid && c.userId === user.uid) ||
          (c.userEmail && user.email && c.userEmail.toLowerCase().trim() === user.email.toLowerCase().trim())
        );
      }).length;

      // Loans Paid count for month m (matching Monthly Collection Summary exactly)
      const monthlyPaidLoans = loanPayments.filter(p =>
        p.status === 'paid' &&
        p.month === m &&
        p.year === selectedYear
      );

      let loanPaidCount = 0;
      if (isPastMonth) {
        loanPaidCount = monthlyPaidLoans.length;
      } else {
        const activeLoansForMonth = loans.filter(loan => {
          const hasPaymentThisMonth = loanPayments.some(p =>
            isPaymentBelongingToLoan(p, loan) &&
            p.month === m &&
            p.year === selectedYear &&
            p.status === 'paid'
          );
          if (hasPaymentThisMonth) return true;

          if (loan.status === 'declined') return false;
          const principalAmount = loan.approvedAmount || loan.amount || 0;
          if (principalAmount <= 0) return false;

          const sanctionDate = loan.approvedAt?.toDate ? loan.approvedAt.toDate() : (loan.createdAt?.toDate ? loan.createdAt.toDate() : new Date());
          const targetMonthEnd = new Date(selectedYear, m, 0, 23, 59, 59, 999);
          if (sanctionDate > targetMonthEnd) return false;

          const priorPayments = loanPayments.filter(p => {
            if (!isPaymentBelongingToLoan(p, loan) || p.status !== 'paid') return false;
            if (p.year && p.month) {
              return p.year < selectedYear || (p.year === selectedYear && p.month < m);
            }
            return false;
          });
          const priorPaidPrincipal = priorPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
          return (principalAmount - priorPaidPrincipal) > 0;
        });

        loanPaidCount = activeLoansForMonth.filter(loan => {
          return loanPayments.some(p =>
            isPaymentBelongingToLoan(p, loan) &&
            p.month === m &&
            p.year === selectedYear &&
            p.status === 'paid'
          );
        }).length;
      }

      const totalPaidCollections = subscriptionPaidCount + loanPaidCount;

      result.push({
        month: m,
        year: selectedYear,
        monthName: MONTH_NAMES[m],
        fullName: `${MONTH_NAMES[m]} ${selectedYear}`,
        subscriptionPaidCount,
        loanPaidCount,
        totalPaidCollections,
        isPastMonth,
        isCurrentMonth,
        isFutureMonth
      });
    }

    return result;
  }, [allUsers, contributions, loans, loanPayments, selectedYear]);

  const totalYearSubscriptionsPaid = React.useMemo(() => {
    return monthlyPaidCountsData.reduce((sum, d) => sum + d.subscriptionPaidCount, 0);
  }, [monthlyPaidCountsData]);

  const totalYearLoansPaid = React.useMemo(() => {
    return monthlyPaidCountsData.reduce((sum, d) => sum + d.loanPaidCount, 0);
  }, [monthlyPaidCountsData]);

  const totalYearCollectionsPaid = totalYearSubscriptionsPaid + totalYearLoansPaid;

  const totalBorrowedSum = React.useMemo(() => {
    return memberLoans.reduce((sum, d) => sum + (d.borrowed || 0), 0);
  }, [memberLoans]);

  const totalRepaidSum = React.useMemo(() => {
    return memberLoans.reduce((sum, d) => sum + (d.totalRepaid || 0), 0);
  }, [memberLoans]);

  const totalOutstandingSum = React.useMemo(() => {
    return memberLoans.reduce((sum, d) => sum + (d.balancePrincipal || 0), 0);
  }, [memberLoans]);

  const totalDisbursedFiltered = React.useMemo(() => {
    return filteredMemberLoansByMonth.reduce((sum, d) => sum + (d.amount || 0), 0);
  }, [filteredMemberLoansByMonth]);

  return (
    <div className={cn("space-y-8 pb-12", isAndroid && "space-y-4 pb-8 px-1")}>
      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-8", isAndroid && "gap-4")}>
        
        {/* Graph Card #1: Month-wise Paid Collections: Subscriptions & Loans (Admin Only) */}
        {isAdmin && (
          <div 
            id="graph-card-monthly-paid-counts"
            className={cn(
              "bg-gradient-to-b from-emerald-50/40 via-white to-white p-6 sm:p-7 rounded-3xl border-2 border-emerald-200/90 shadow-sm hover:shadow-md hover:border-emerald-300/90 lg:col-span-2 relative overflow-hidden transition-all",
              isAndroid && "p-4 overflow-hidden"
            )}
          >
          {/* Top-Right Index Badge */}
          <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-emerald-600 text-xs font-black text-white rounded-bl-2xl shadow-xs z-10 select-none">
            #1
          </div>

          <div 
            onClick={() => toggleGraph('monthly-paid-counts')}
            className={cn(
              "flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group select-none transition-colors pr-12 sm:pr-14",
              !collapsedGraphs['monthly-paid-counts'] ? "mb-6" : "mb-0"
            )}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-100/90 border border-emerald-300/80 flex items-center justify-center text-emerald-700 shadow-sm group-hover:scale-105 transition-transform shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-black text-slate-900 group-hover:text-emerald-700 transition-colors">
                    Paid Collections: Subscriptions & Loans ({selectedYear})
                  </h3>
                  <span className="text-slate-400 group-hover:text-emerald-700 transition-colors">
                    {collapsedGraphs['monthly-paid-counts'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                  </span>
                </div>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Live counts of member subscriptions paid and loan repayments paid for each month (strictly matches Monthly Collection Summary)
                </p>
              </div>
            </div>

            {/* Header KPI Badges & Excel Export */}
            <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-300 text-xs font-bold shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                <span>Subscriptions: {totalYearSubscriptionsPaid} Paid</span>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-800 rounded-xl border border-indigo-300 text-xs font-bold shadow-2xs">
                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                <span>Loans: {totalYearLoansPaid} Paid</span>
              </div>

              {isAdmin && (
                <button
                  type="button"
                  disabled={exportingGraph === 'monthly-paid-counts'}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (exportingGraph) return;
                    try {
                      setExportingGraph('monthly-paid-counts');
                      if (collapsedGraphs['monthly-paid-counts']) {
                        setCollapsedGraphs(prev => ({ ...prev, 'monthly-paid-counts': false }));
                        await new Promise(r => setTimeout(r, 300));
                      } else {
                        await new Promise(r => setTimeout(r, 60));
                      }
                      const chartImg = await captureChartImage('graph-card-monthly-paid-counts');
                      await exportGraphMonthlyPaidCountsExcel({
                        data: monthlyPaidCountsData,
                        selectedYear,
                        totalSubscriptionsPaid: totalYearSubscriptionsPaid,
                        totalLoansPaid: totalYearLoansPaid,
                        chartImage: chartImg,
                        notify
                      });
                    } catch (err: any) {
                      console.error('Failed to export Monthly Paid Counts graph:', err);
                      notify?.('error', 'Failed to export Excel report');
                    } finally {
                      setExportingGraph(null);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer",
                    exportingGraph === 'monthly-paid-counts'
                      ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                      : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200 active:scale-95"
                  )}
                  title="Export this chart and monthly paid count records to Excel"
                >
                  {exportingGraph === 'monthly-paid-counts' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                  )}
                  <span className="hidden sm:inline">Excel</span>
                </button>
              )}
            </div>
          </div>

          {!collapsedGraphs['monthly-paid-counts'] && (
            <div className="space-y-4">
              {/* Responsive BarChart Container */}
              <div className="w-full overflow-x-auto overflow-y-hidden pb-2 pt-2 scrollbar-thin scrollbar-thumb-slate-200">
                <div style={{ minWidth: `${getDynamicChartWidth(12)}px`, height: isAndroid ? 340 : 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyPaidCountsData}
                      margin={{ top: 28, right: 16, left: -10, bottom: 8 }}
                      barGap={4}
                    >
                      <defs>
                        <linearGradient id="paidCountsSubscriptionGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                        </linearGradient>
                        <linearGradient id="paidCountsLoanGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
                          <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.9} />
                        </linearGradient>
                      </defs>

                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      
                      <XAxis 
                        dataKey="monthName" 
                        stroke="#64748b" 
                        tick={{ fontSize: isAndroid ? 11 : 12, fill: '#334155', fontWeight: 600 }}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />
                      
                      <YAxis 
                        stroke="#64748b" 
                        tick={{ fontSize: isAndroid ? 10 : 11, fill: '#64748b' }}
                        allowDecimals={false}
                        domain={[0, 'auto']}
                        tickLine={false}
                        axisLine={{ stroke: '#cbd5e1' }}
                      />

                      <Tooltip 
                        content={({ active, payload }: any) => {
                          if (active && payload && payload.length) {
                            const d = payload[0].payload;
                            const isPast = d.isPastMonth;
                            const isCurrent = d.isCurrentMonth;
                            const statusText = isPast ? 'Closed Month' : (isCurrent ? 'Current Month (Live)' : 'Upcoming');
                            const statusBadge = isPast 
                              ? 'bg-slate-100 text-slate-700 border-slate-300' 
                              : (isCurrent ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-black' : 'bg-amber-100 text-amber-800 border-amber-300');

                            return (
                              <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200 text-xs space-y-2.5 min-w-[240px]">
                                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                                  <div className="flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                                    <Calendar className="w-4 h-4 text-emerald-600" />
                                    <span>{d.fullName}</span>
                                  </div>
                                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold border", statusBadge)}>
                                    {statusText}
                                  </span>
                                </div>

                                <div className="space-y-1.5">
                                  <div className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                                      Subscriptions Paid:
                                    </span>
                                    <span className="font-bold text-emerald-700 text-sm">
                                      {d.subscriptionPaidCount} members
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                                      <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
                                      Loan Repayments Paid:
                                    </span>
                                    <span className="font-bold text-indigo-700 text-sm">
                                      {d.loanPaidCount} loans
                                    </span>
                                  </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between font-black text-slate-800">
                                  <span>Total Collections:</span>
                                  <span className="text-sm font-bold text-slate-900">
                                    {d.totalPaidCollections}
                                  </span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }} 
                      />

                      <Legend 
                        wrapperStyle={{ paddingTop: '16px' }}
                        formatter={(value) => <span className="text-xs font-bold text-slate-700">{value}</span>}
                      />

                      <Bar 
                        dataKey="subscriptionPaidCount" 
                        name="Subscriptions Paid (Count)" 
                        fill="url(#paidCountsSubscriptionGradient)" 
                        radius={[6, 6, 0, 0]} 
                        maxBarSize={36}
                      >
                        <LabelList 
                          dataKey="subscriptionPaidCount" 
                          position="top" 
                          formatter={(val: any) => (Number(val) > 0 ? val : '')} 
                          style={{ fontSize: '11px', fontWeight: 800, fill: '#059669' }} 
                        />
                      </Bar>

                      <Bar 
                        dataKey="loanPaidCount" 
                        name="Loan Repayments Paid (Count)" 
                        fill="url(#paidCountsLoanGradient)" 
                        radius={[6, 6, 0, 0]} 
                        maxBarSize={36}
                      >
                        <LabelList 
                          dataKey="loanPaidCount" 
                          position="top" 
                          formatter={(val: any) => (Number(val) > 0 ? val : '')} 
                          style={{ fontSize: '11px', fontWeight: 800, fill: '#4f46e5' }} 
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Bottom Reassurance Strip */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-semibold text-slate-700">
                    Reconciled live counts matching Monthly Collection Summary.
                  </span>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold">
                  <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    Total Subscriptions: {totalYearSubscriptionsPaid}
                  </span>
                  <span className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                    Total Loan Repayments: {totalYearLoansPaid}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
        )}

        {/* Month-wise Sanctioned Loans & Repayments Chart (Admin Only) */}
        {isAdmin && (
          <div 
            id="graph-card-sanctions-repayments"
            className={cn(
              "bg-gradient-to-b from-indigo-50/30 via-white to-white p-6 sm:p-7 rounded-3xl border-2 border-indigo-100/90 shadow-sm hover:shadow-md hover:border-indigo-200/90 lg:col-span-2 relative overflow-hidden transition-all",
              isAndroid && "p-4 overflow-hidden"
            )}
          >
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-indigo-50/90 text-xs font-black text-indigo-700 rounded-bl-2xl border-b border-l border-indigo-200/80 shadow-2xs z-10 select-none">
              #2
            </div>

            <div 
              onClick={() => toggleGraph('sanctions-repayments')}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group select-none transition-colors pr-10 sm:pr-12",
                !collapsedGraphs['sanctions-repayments'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-sm group-hover:scale-105 transition-transform shrink-0">
                  <HandCoins className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 group-hover:text-indigo-600 transition-colors">
                      Loan Sanctions & Repayments ({selectedYear})
                    </h3>
                    <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                      {collapsedGraphs['sanctions-repayments'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Month-by-month loan disbursements sanctioned vs repayments collected (principal + interest)
                  </p>
                </div>
              </div>

              {/* Header KPI Badges & Excel Export */}
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-800 rounded-xl border border-indigo-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  <span>Sanctioned: ₹{totalSanctionedSum.toLocaleString('en-IN')} ({totalSanctionedCount})</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>Repaid: ₹{totalRepaymentsSum.toLocaleString('en-IN')} ({totalRepaymentsCount})</span>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={exportingGraph === 'sanctions-repayments'}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (exportingGraph) return;
                      try {
                        setExportingGraph('sanctions-repayments');
                        if (collapsedGraphs['sanctions-repayments']) {
                          setCollapsedGraphs(prev => ({ ...prev, 'sanctions-repayments': false }));
                          await new Promise(r => setTimeout(r, 300));
                        } else {
                          await new Promise(r => setTimeout(r, 60));
                        }
                        const chartImg = await captureChartImage('graph-card-sanctions-repayments');
                        await exportGraphLoanSanctionsRepaymentsExcel({
                          data: monthlySanctionedLoansData,
                          selectedYear,
                          totalSanctionedSum,
                          totalRepaymentsSum,
                          totalSanctionedCount,
                          totalRepaymentsCount,
                          chartImage: chartImg,
                          notify
                        });
                      } catch (err: any) {
                        console.error('Failed to export Loan Sanctions graph:', err);
                        notify?.('error', 'Failed to export Excel report');
                      } finally {
                        setExportingGraph(null);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer",
                      exportingGraph === 'sanctions-repayments'
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : "bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-200 active:scale-95"
                    )}
                    title="Export this chart and loan sanction records to Excel"
                  >
                    {exportingGraph === 'sanctions-repayments' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                )}
              </div>
            </div>

            {!collapsedGraphs['sanctions-repayments'] && (
              <div className="space-y-4">
                <div className="w-full overflow-x-auto overflow-y-hidden pb-2 pt-2 scrollbar-thin scrollbar-thumb-slate-200">
                  <div style={{ minWidth: `${getDynamicChartWidth(12)}px`, height: isAndroid ? 340 : 400 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={monthlySanctionedLoansData}
                        margin={{ top: 28, right: 16, left: -10, bottom: 8 }}
                        barGap={4}
                      >
                        <defs>
                          <linearGradient id="sanctionsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#818cf8" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="repaymentsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        
                        <XAxis 
                          dataKey="name" 
                          stroke="#64748b" 
                          tick={{ fontSize: isAndroid ? 11 : 12, fill: '#334155', fontWeight: 600 }}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        
                        <YAxis 
                          stroke="#64748b" 
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#64748b' }}
                          tickFormatter={(val) => formatBarAmountValue(val)}
                          domain={[0, 'auto']}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />

                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white/95 backdrop-blur-xs p-3.5 rounded-2xl shadow-xl border border-slate-200 text-xs space-y-2 min-w-[220px]">
                                  <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
                                    <span>{d.name}</span>
                                    <span className="text-[10px] text-slate-500 font-normal">Month {d.month}</span>
                                  </div>

                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                                        <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600 inline-block" />
                                        Sanctioned Loans:
                                      </span>
                                      <span className="font-bold text-indigo-700 text-sm">
                                        ₹{d.sanctionedAmount.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 pl-4">
                                      {d.sanctionCount} loan(s) sanctioned
                                    </div>

                                    <div className="flex items-center justify-between gap-4 pt-1">
                                      <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                                        Repayments Received:
                                      </span>
                                      <span className="font-bold text-emerald-700 text-sm">
                                        ₹{d.repaidAmount.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 pl-4">
                                      Principal: ₹{d.repaymentPrincipal.toLocaleString('en-IN')} • Interest: ₹{d.repaymentInterest.toLocaleString('en-IN')}
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }} 
                        />

                        <Legend 
                          wrapperStyle={{ paddingTop: '16px' }}
                          formatter={(value) => <span className="text-xs font-bold text-slate-700">{value}</span>}
                        />

                        <Bar 
                          dataKey="sanctionedAmount" 
                          name="Sanctioned Loans (₹)" 
                          fill="url(#sanctionsGradient)" 
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={36}
                        >
                          <LabelList 
                            dataKey="sanctionedAmount" 
                            position="top" 
                            formatter={(val: any) => formatBarAmountValue(val)} 
                            style={{ fontSize: '10px', fontWeight: 800, fill: '#4f46e5' }} 
                          />
                        </Bar>

                        <Bar 
                          dataKey="repaidAmount" 
                          name="Repayments Received (₹)" 
                          fill="url(#repaymentsGradient)" 
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={36}
                        >
                          <LabelList 
                            dataKey="repaidAmount" 
                            position="top" 
                            formatter={(val: any) => formatBarAmountValue(val)} 
                            style={{ fontSize: '10px', fontWeight: 800, fill: '#059669' }} 
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Bottom Reassurance Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="font-semibold text-slate-700">
                      Live reconciliations of sanctioned borrowings vs payments.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      Total Sanctioned: ₹{totalSanctionedSum.toLocaleString('en-IN')}
                    </span>
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Total Repayments: ₹{totalRepaymentsSum.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Graph Card #3: Member-wise Borrowed vs Repaid */}
        {(isAdmin || memberLoans.length > 0) && (
          <div 
            id="graph-card-memberwise-borrowed-repaid"
            className={cn(
              "bg-gradient-to-b from-sky-50/40 via-white to-white p-6 sm:p-7 rounded-3xl border-2 border-sky-200/90 shadow-sm hover:shadow-md hover:border-sky-300/90 lg:col-span-2 relative overflow-hidden transition-all",
              isAndroid && "p-4 overflow-hidden"
            )}
          >
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-sky-600 text-xs font-black text-white rounded-bl-2xl shadow-xs z-10 select-none">
              #3
            </div>

            <div 
              onClick={() => toggleGraph('memberwise-borrowed-repaid')}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group select-none transition-colors pr-10 sm:pr-12",
                !collapsedGraphs['memberwise-borrowed-repaid'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shadow-sm group-hover:scale-105 transition-transform shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 group-hover:text-sky-600 transition-colors">
                      Member-wise Borrowed vs Repaid ({selectedYear})
                    </h3>
                    <span className="text-slate-400 group-hover:text-sky-600 transition-colors">
                      {collapsedGraphs['memberwise-borrowed-repaid'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Individual member audit comparing total loan principal sanctioned vs total repayments collected (principal + interest)
                  </p>
                </div>
              </div>

              {/* Header KPI Badges & Excel Export */}
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-sky-50 text-sky-800 rounded-xl border border-sky-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-sky-600" />
                  <span>Borrowed: ₹{totalBorrowedSum.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-800 rounded-xl border border-emerald-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>Repaid: ₹{totalRepaidSum.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 text-rose-800 rounded-xl border border-rose-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-rose-600" />
                  <span>Outstanding: ₹{totalOutstandingSum.toLocaleString('en-IN')}</span>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={exportingGraph === 'memberwise-borrowed-repaid'}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (exportingGraph) return;
                      try {
                        setExportingGraph('memberwise-borrowed-repaid');
                        if (collapsedGraphs['memberwise-borrowed-repaid']) {
                          setCollapsedGraphs(prev => ({ ...prev, 'memberwise-borrowed-repaid': false }));
                          await new Promise(r => setTimeout(r, 300));
                        } else {
                          await new Promise(r => setTimeout(r, 60));
                        }
                        const chartImg = await captureChartImage('graph-card-memberwise-borrowed-repaid');
                        await exportGraphMemberwiseBorrowedRepaidExcel({
                          data: memberLoans,
                          selectedYear,
                          chartImage: chartImg,
                          notify
                        });
                      } catch (err: any) {
                        console.error('Failed to export Memberwise Borrowed vs Repaid graph:', err);
                        notify?.('error', 'Failed to export Excel report');
                      } finally {
                        setExportingGraph(null);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer",
                      exportingGraph === 'memberwise-borrowed-repaid'
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : "bg-sky-600 hover:bg-sky-700 text-white shadow-sky-200 active:scale-95"
                    )}
                    title="Export this chart and member loan records to Excel"
                  >
                    {exportingGraph === 'memberwise-borrowed-repaid' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                )}
              </div>
            </div>

            {!collapsedGraphs['memberwise-borrowed-repaid'] && (
              <div className="space-y-4">
                {/* Responsive BarChart Container */}
                <div className="w-full overflow-x-auto overflow-y-hidden pb-2 pt-2 scrollbar-thin scrollbar-thumb-slate-200">
                  <div style={{ minWidth: `${getDynamicChartWidth(memberLoans.length)}px`, height: isAndroid ? 370 : 430 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={memberLoans}
                        margin={{ top: 28, right: 16, left: -10, bottom: 45 }}
                        barGap={4}
                      >
                        <defs>
                          <linearGradient id="borrowedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#0284c7" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="memberRepaidGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        
                        <XAxis 
                          dataKey="displayNameWithActive" 
                          stroke="#64748b" 
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#334155', fontWeight: 600 }}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                          interval={0}
                          angle={-35}
                          textAnchor="end"
                          height={65}
                        />
                        
                        <YAxis 
                          stroke="#64748b" 
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#64748b' }}
                          tickFormatter={(val) => formatBarAmountValue(val)}
                          domain={[0, 'auto']}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />

                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white/95 backdrop-blur-xs p-3.5 rounded-2xl shadow-xl border border-slate-200 text-xs space-y-2 min-w-[240px]">
                                  <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
                                    <span className="truncate max-w-[150px]">{d.name}</span>
                                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-md bg-sky-100 text-sky-800 border border-sky-200">
                                      {d.totalLoans} loan(s)
                                    </span>
                                  </div>

                                  <div className="space-y-1 pt-1">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                                        <span className="w-2.5 h-2.5 rounded-sm bg-sky-600 inline-block" />
                                        Total Borrowed:
                                      </span>
                                      <span className="font-bold text-sky-700 text-sm">
                                        ₹{d.borrowed.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 pl-4">
                                      {d.activeLoans} active, {d.closedLoans} closed loan(s)
                                    </div>

                                    <div className="flex items-center justify-between gap-4 pt-1">
                                      <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                                        <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block" />
                                        Total Repaid:
                                      </span>
                                      <span className="font-bold text-emerald-700 text-sm">
                                        ₹{d.totalRepaid.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-slate-400 pl-4">
                                      Principal: ₹{d.repaidPrincipal.toLocaleString('en-IN')} • Interest: ₹{d.interestPaid.toLocaleString('en-IN')}
                                    </div>

                                    <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                                      <span className="flex items-center gap-1.5 font-semibold text-slate-600">
                                        <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" />
                                        Outstanding Due:
                                      </span>
                                      <span className="font-bold text-rose-700 text-sm">
                                        ₹{d.balancePrincipal.toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }} 
                        />

                        <Legend 
                          wrapperStyle={{ paddingTop: '16px' }}
                          formatter={(value) => <span className="text-xs font-bold text-slate-700">{value}</span>}
                        />

                        <Bar 
                          dataKey="borrowed" 
                          name="Total Borrowed (₹)" 
                          fill="url(#borrowedGradient)" 
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={36}
                        >
                          <LabelList 
                            dataKey="borrowed" 
                            position="top" 
                            formatter={(val: any) => formatBarAmountValue(val)} 
                            style={{ fontSize: '10px', fontWeight: 800, fill: '#0284c7' }} 
                          />
                        </Bar>

                        <Bar 
                          dataKey="totalRepaid" 
                          name="Total Repaid (₹)" 
                          fill="url(#memberRepaidGradient)" 
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={36}
                        >
                          <LabelList 
                            dataKey="totalRepaid" 
                            position="top" 
                            formatter={(val: any) => formatBarAmountValue(val)} 
                            style={{ fontSize: '10px', fontWeight: 800, fill: '#059669' }} 
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Bottom Reassurance Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
                    <span className="font-semibold text-slate-700">
                      Member-level audit comparing disbursed principal with total repayments collected.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-md">
                      Total Borrowed: ₹{totalBorrowedSum.toLocaleString('en-IN')}
                    </span>
                    <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                      Total Repaid: ₹{totalRepaidSum.toLocaleString('en-IN')}
                    </span>
                    <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                      Net Outstanding: ₹{totalOutstandingSum.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Graph Card #4: Member-wise Loan Disbursements by Month (Admin Only) */}
        {isAdmin && (
          <div 
            id="graph-card-member-disbursements"
            className={cn(
              "bg-gradient-to-b from-violet-50/40 via-white to-white p-6 sm:p-7 rounded-3xl border-2 border-violet-200/90 shadow-sm hover:shadow-md hover:border-violet-300/90 lg:col-span-2 relative overflow-hidden transition-all",
              isAndroid && "p-4 overflow-hidden"
            )}
          >
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-violet-600 text-xs font-black text-white rounded-bl-2xl shadow-xs z-10 select-none">
              #4
            </div>

            <div 
              onClick={() => toggleGraph('member-disbursements')}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group select-none transition-colors pr-10 sm:pr-12",
                !collapsedGraphs['member-disbursements'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shadow-sm group-hover:scale-105 transition-transform shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 group-hover:text-violet-600 transition-colors">
                      Member-wise Loan Disbursements by Month ({selectedYear})
                    </h3>
                    <span className="text-slate-400 group-hover:text-violet-600 transition-colors">
                      {collapsedGraphs['member-disbursements'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Chronological loan disbursements by month with active and closed loan portfolio breakdown
                  </p>
                </div>
              </div>

              {/* Header KPI Badges & Excel Export */}
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-violet-50 text-violet-800 rounded-xl border border-violet-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-violet-600" />
                  <span>Disbursed: ₹{totalDisbursedFiltered.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 text-slate-800 rounded-xl border border-slate-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-slate-600" />
                  <span>Loans: {filteredMemberLoansByMonth.length}</span>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={exportingGraph === 'member-disbursements'}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (exportingGraph) return;
                      try {
                        setExportingGraph('member-disbursements');
                        if (collapsedGraphs['member-disbursements']) {
                          setCollapsedGraphs(prev => ({ ...prev, 'member-disbursements': false }));
                          await new Promise(r => setTimeout(r, 300));
                        } else {
                          await new Promise(r => setTimeout(r, 60));
                        }
                        const chartImg = await captureChartImage('graph-card-member-disbursements');
                        await exportGraphMemberDisbursementsExcel({
                          data: filteredMemberLoansByMonth,
                          selectedYear,
                          selectedMonthFilter: selectedLoanMonthFilter,
                          chartImage: chartImg,
                          notify
                        });
                      } catch (err: any) {
                        console.error('Failed to export Member Disbursements graph:', err);
                        notify?.('error', 'Failed to export Excel report');
                      } finally {
                        setExportingGraph(null);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer",
                      exportingGraph === 'member-disbursements'
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : "bg-violet-600 hover:bg-violet-700 text-white shadow-violet-200 active:scale-95"
                    )}
                    title="Export this chart and monthly disbursement records to Excel"
                  >
                    {exportingGraph === 'member-disbursements' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                )}
              </div>
            </div>

            {!collapsedGraphs['member-disbursements'] && (
              <div className="space-y-4">
                {/* Month Filter Pills */}
                {availableLoanMonths.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                    <button
                      type="button"
                      onClick={() => setSelectedLoanMonthFilter('all')}
                      className={cn(
                        "px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                        selectedLoanMonthFilter === 'all'
                          ? "bg-violet-600 text-white shadow-xs"
                          : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                      )}
                    >
                      All Months ({memberLoansByMonth.length})
                    </button>
                    {loansGroupedByMonth.map(g => (
                      <button
                        key={g.monthLabel}
                        type="button"
                        onClick={() => setSelectedLoanMonthFilter(g.monthLabel)}
                        className={cn(
                          "px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5",
                          selectedLoanMonthFilter === g.monthLabel
                            ? "bg-violet-600 text-white shadow-xs"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                        )}
                      >
                        <span>{g.monthLabel}</span>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.2 rounded-full",
                          selectedLoanMonthFilter === g.monthLabel ? "bg-white/20 text-white" : "bg-slate-200 text-slate-700"
                        )}>
                          {g.members.length}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Responsive BarChart Container */}
                <div className="w-full overflow-x-auto overflow-y-hidden pb-2 pt-2 scrollbar-thin scrollbar-thumb-slate-200">
                  <div style={{ minWidth: `${getDynamicChartWidth(filteredMemberLoansByMonth.length)}px`, height: isAndroid ? 370 : 430 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={filteredMemberLoansByMonth}
                        margin={{ top: 28, right: 16, left: -10, bottom: 45 }}
                        barGap={4}
                      >
                        <defs>
                          <linearGradient id="disbursedActiveGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="disbursedClosedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        
                        <XAxis 
                          dataKey="displayNameWithMonth" 
                          stroke="#64748b" 
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#334155', fontWeight: 600 }}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                          interval={0}
                          angle={-35}
                          textAnchor="end"
                          height={65}
                        />
                        
                        <YAxis 
                          stroke="#64748b" 
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#64748b' }}
                          tickFormatter={(val) => formatBarAmountValue(val)}
                          domain={[0, 'auto']}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />

                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              const isPaid = d.status === 'paid';
                              return (
                                <div className="bg-white/95 backdrop-blur-xs p-3.5 rounded-2xl shadow-xl border border-slate-200 text-xs space-y-2 min-w-[220px]">
                                  <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
                                    <span>{d.memberName}</span>
                                    <span className={cn(
                                      "text-[10px] font-extrabold px-1.5 py-0.5 rounded-md border",
                                      isPaid ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-violet-50 text-violet-800 border-violet-200"
                                    )}>
                                      {isPaid ? "Closed / Repaid" : "Active Loan"}
                                    </span>
                                  </div>

                                  <div className="space-y-1 pt-1">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="font-semibold text-slate-600">Disbursal Month:</span>
                                      <span className="font-bold text-slate-900">{d.monthLabel}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="font-semibold text-slate-600">Disbursed Principal:</span>
                                      <span className="font-bold text-violet-700 text-sm">₹{d.amount.toLocaleString('en-IN')}</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }} 
                        />

                        <Bar 
                          dataKey="amount" 
                          name="Disbursed Principal (₹)" 
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={42}
                        >
                          {filteredMemberLoansByMonth.map((entry, index) => (
                            <Cell 
                              key={`cell-disbursed-${entry.uniqueKey || index}`} 
                              fill={entry.status === 'paid' ? 'url(#disbursedClosedGradient)' : 'url(#disbursedActiveGradient)'} 
                            />
                          ))}
                          <LabelList 
                            dataKey="amount" 
                            position="top" 
                            formatter={(val: any) => formatBarAmountValue(val)} 
                            style={{ fontSize: '10px', fontWeight: 800, fill: '#7c3aed' }} 
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Bottom Reassurance Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-violet-600" />
                      <span className="font-semibold text-slate-700">Active Loan Disbursed</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                      <span className="font-semibold text-slate-700">Closed / Repaid Loan</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="text-violet-700 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md">
                      Filtered Total: ₹{totalDisbursedFiltered.toLocaleString('en-IN')}
                    </span>
                    <span className="text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                      Total Loans: {filteredMemberLoansByMonth.length}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Graph Card #5: Financial Health & Liquidity Overview (Admin Only) */}
        {isAdmin && (
          <div 
            id="graph-card-financial-health"
            className={cn(
              "bg-gradient-to-b from-slate-50/50 via-white to-white p-6 sm:p-7 rounded-3xl border-2 border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300/90 lg:col-span-2 relative overflow-hidden transition-all",
              isAndroid && "p-4 overflow-hidden"
            )}
          >
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-slate-800 text-xs font-black text-white rounded-bl-2xl shadow-xs z-10 select-none">
              #5
            </div>

            <div 
              onClick={() => toggleGraph('financial-health')}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group select-none transition-colors pr-10 sm:pr-12",
                !collapsedGraphs['financial-health'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-800 shadow-sm group-hover:scale-105 transition-transform shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-slate-900 group-hover:text-slate-800 transition-colors">
                      Financial Health & Liquidity Overview ({selectedYear})
                    </h3>
                    <span className="text-slate-400 group-hover:text-slate-800 transition-colors">
                      {collapsedGraphs['financial-health'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Consolidated capital reserves, loan deployment, principal recovery, and liquid balance audit
                  </p>
                </div>
              </div>

              {/* Header KPI Badges & Excel Export */}
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 text-indigo-800 rounded-xl border border-indigo-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-indigo-600" />
                  <span>Group Funds: ₹{financialHealthData.totalGroupFunds.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-800 rounded-xl border border-amber-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span>Interest Received: ₹{financialHealthData.paidInterestInYear.toLocaleString('en-IN')}</span>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-cyan-50 text-cyan-800 rounded-xl border border-cyan-300 text-xs font-bold shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-cyan-600" />
                  <span>Available: ₹{financialHealthData.availableBalance.toLocaleString('en-IN')}</span>
                </div>

                {isAdmin && (
                  <button
                    type="button"
                    disabled={exportingGraph === 'financial-health'}
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (exportingGraph) return;
                      try {
                        setExportingGraph('financial-health');
                        if (collapsedGraphs['financial-health']) {
                          setCollapsedGraphs(prev => ({ ...prev, 'financial-health': false }));
                          await new Promise(r => setTimeout(r, 300));
                        } else {
                          await new Promise(r => setTimeout(r, 60));
                        }
                        const chartImg = await captureChartImage('graph-card-financial-health');
                        await exportGraphFinancialHealthExcel({
                          data: financialHealthData,
                          selectedYear,
                          chartImage: chartImg,
                          notify
                        });
                      } catch (err: any) {
                        console.error('Failed to export Financial Health graph:', err);
                        notify?.('error', 'Failed to export Excel report');
                      } finally {
                        setExportingGraph(null);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer",
                      exportingGraph === 'financial-health'
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : "bg-slate-800 hover:bg-slate-900 text-white shadow-slate-200 active:scale-95"
                    )}
                    title="Export this chart and financial health metrics to Excel"
                  >
                    {exportingGraph === 'financial-health' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                    )}
                    <span className="hidden sm:inline">Excel</span>
                  </button>
                )}
              </div>
            </div>

            {!collapsedGraphs['financial-health'] && (
              <div className="space-y-4">
                {/* Responsive BarChart Container */}
                <div className="w-full overflow-x-auto overflow-y-hidden pb-2 pt-2 scrollbar-thin scrollbar-thumb-slate-200">
                  <div style={{ minWidth: isAndroid ? '380px' : '100%', height: isAndroid ? 340 : 380 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={financialHealthData.chartData}
                        margin={{ top: 28, right: 16, left: -10, bottom: 8 }}
                      >
                        <defs>
                          <linearGradient id="healthTotalFundsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#4338ca" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="healthInterestGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fbbf24" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#d97706" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="healthLoansSanctionedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#7e22ce" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="healthLoansRepaidGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="healthOutstandingGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#fb7185" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#e11d48" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="healthAvailableGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.95} />
                            <stop offset="100%" stopColor="#0284c7" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>

                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        
                        <XAxis 
                          dataKey="category" 
                          stroke="#64748b" 
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#334155', fontWeight: 600 }}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />
                        
                        <YAxis 
                          stroke="#64748b" 
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#64748b' }}
                          tickFormatter={(val) => formatBarAmountValue(val)}
                          domain={[0, 'auto']}
                          tickLine={false}
                          axisLine={{ stroke: '#cbd5e1' }}
                        />

                        <Tooltip 
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const d = payload[0].payload;
                              return (
                                <div className="bg-white/95 backdrop-blur-xs p-3.5 rounded-2xl shadow-xl border border-slate-200 text-xs space-y-2 min-w-[240px]">
                                  <div className="font-bold text-slate-900 border-b border-slate-100 pb-1 flex items-center justify-between">
                                    <span>{d.category}</span>
                                    <span className="text-[10px] text-slate-400 font-normal">{d.subtitle}</span>
                                  </div>

                                  <div className="space-y-1.5 pt-1">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="font-semibold text-slate-600">Total Bar Amount:</span>
                                      <span className="font-bold text-slate-900 text-sm">₹{d.totalAmount.toLocaleString('en-IN')}</span>
                                    </div>
                                    {d.interestAmount > 0 && (
                                      <div className="pt-1.5 border-t border-slate-100 space-y-1">
                                        <div className="flex items-center justify-between gap-4 text-[11px]">
                                          <span className="flex items-center gap-1.5 text-indigo-700 font-semibold">
                                            <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                            Member Contributions:
                                          </span>
                                          <span className="font-bold text-indigo-900">₹{d.baseAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-4 text-[11px]">
                                          <span className="flex items-center gap-1.5 text-amber-700 font-semibold">
                                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                                            Interest Received (0.5%):
                                          </span>
                                          <span className="font-bold text-amber-900">+₹{d.interestAmount.toLocaleString('en-IN')}</span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                            return null;
                          }} 
                        />

                        {/* Base bar: Subscriptions / Principal */}
                        <Bar 
                          dataKey="baseAmount" 
                          name="Base / Principal (₹)" 
                          stackId="healthStack"
                          radius={[4, 4, 0, 0]} 
                          maxBarSize={56}
                        >
                          {financialHealthData.chartData.map((entry, index) => (
                            <Cell 
                              key={`cell-health-base-${entry.key || index}`} 
                              fill={entry.fill} 
                            />
                          ))}
                        </Bar>

                        {/* Stacked top bar: Interest portion for Total Group Funds in distinct warm amber */}
                        <Bar 
                          dataKey="interestAmount" 
                          name="Interest Received (₹)" 
                          stackId="healthStack"
                          radius={[6, 6, 0, 0]} 
                          maxBarSize={56}
                        >
                          {financialHealthData.chartData.map((entry, index) => (
                            <Cell 
                              key={`cell-health-interest-${entry.key || index}`} 
                              fill={entry.interestAmount > 0 ? "url(#healthInterestGradient)" : "transparent"} 
                            />
                          ))}
                          <LabelList 
                            dataKey="totalAmount" 
                            position="top" 
                            formatter={(val: any) => formatBarAmountValue(val)} 
                            style={{ fontSize: '10px', fontWeight: 800, fill: '#334155' }} 
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Bottom Reassurance Strip */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-slate-800 animate-pulse" />
                    <span className="font-semibold text-slate-700">
                      Unrestricted liquidity pool: Available balance equals total group savings minus current outstanding borrowings.
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] font-bold">
                    <span className="text-cyan-700 bg-cyan-50 border border-cyan-200 px-2 py-0.5 rounded-md">
                      Net Liquidity: ₹{financialHealthData.availableBalance.toLocaleString('en-IN')}
                    </span>
                    <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">
                      Active Borrowings: ₹{financialHealthData.outstandingLoans.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default Graphs;
