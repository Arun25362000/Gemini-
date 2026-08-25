import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList, Cell
} from 'recharts';
import { HandCoins, TrendingUp, Calendar, CheckCircle2, Users, UserCheck, ChevronDown, ChevronUp, CircleDot, Wallet, Landmark, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { UserProfile, Contribution, Loan, LoanPayment } from '../types';
import { cn } from '../lib/utils';

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
  selectedYear: propSelectedYear
}) => {
  const [isMobileScreen, setIsMobileScreen] = React.useState(false);
  const [selectedLoanMonthFilter, setSelectedLoanMonthFilter] = React.useState<string>('all');
  const [collapsedGraphs, setCollapsedGraphs] = React.useState<Record<string, boolean>>({});

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

  // Personal Monthly Contributions (Member) filtered by selectedYear
  const memberContributionsData = React.useMemo(() => {
    return Object.values(
      contributions
        .filter(c => c.userEmail?.toLowerCase() === userEmail.toLowerCase() && c.year === selectedYear && c.status === 'paid')
        .reduce((acc, c) => {
          const monthKey = `${c.month}-${c.year}`;
          const name = `${MONTH_NAMES[c.month]} ${c.year}`;
          if (!acc[monthKey]) {
            acc[monthKey] = {
              name: name,
              uniqueId: monthKey,
              valName: name,
              amount: 0,
              month: c.month,
              year: c.year
            };
          }
          acc[monthKey].amount += c.amount;
          return acc;
        }, {} as Record<string, { name: string; valName: string; uniqueId: string; amount: number; month: number; year: number }>)
    ).sort((a, b) => a.month - b.month);
  }, [contributions, userEmail, selectedYear]);

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

    // 1. Accumulate Sanctioned Loans in selectedYear
    sanctionedLoansInYear.forEach(l => {
      const date = getLoanSanctionDate(l);
      const month = date.getMonth() + 1;
      const amount = l.approvedAmount || l.amount || 0;

      if (!map[month]) {
        map[month] = {
          key: `${selectedYear}-${String(month).padStart(2, '0')}`,
          name: `${MONTH_NAMES[month]} ${selectedYear}`,
          month,
          year: selectedYear,
          sanctionedAmount: 0,
          sanctionCount: 0,
          repaidAmount: 0,
          repaymentCount: 0,
          repaymentPrincipal: 0,
          repaymentInterest: 0
        };
      }
      map[month].sanctionedAmount += amount;
      map[month].sanctionCount += 1;
    });

    // 2. Accumulate Repayments Received in selectedYear
    paidLoanPaymentsInYear.forEach(p => {
      const month = p.month || (p.timestamp?.toDate ? p.timestamp.toDate().getMonth() + 1 : new Date().getMonth() + 1);
      const principal = p.amount || 0;
      const interest = p.interest || 0;
      const totalRepaid = principal + interest;

      if (!map[month]) {
        map[month] = {
          key: `${selectedYear}-${String(month).padStart(2, '0')}`,
          name: `${MONTH_NAMES[month]} ${selectedYear}`,
          month,
          year: selectedYear,
          sanctionedAmount: 0,
          sanctionCount: 0,
          repaidAmount: 0,
          repaymentCount: 0,
          repaymentPrincipal: 0,
          repaymentInterest: 0
        };
      }
      map[month].repaidAmount += totalRepaid;
      map[month].repaymentCount += 1;
      map[month].repaymentPrincipal += principal;
      map[month].repaymentInterest += interest;
    });

    return Object.values(map).sort((a, b) => a.month - b.month);
  }, [sanctionedLoansInYear, paidLoanPaymentsInYear, selectedYear]);

  // 2. Member vs Loan Received and Paid (Includes ALL Loans: Active & Closed)
  const memberLoans = React.useMemo(() => {
    return allUsers
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
          totalLoans: totalLoansCount,
          activeLoans: activeLoanCount,
          closedLoans: closedLoanCount,
          displayNameWithActive: `${baseName} (${totalLoansCount})`
        };
      })
      .filter(d => isAdmin ? (d.borrowed > 0 || d.totalRepaid > 0) : d.email === userEmail.toLowerCase())
      .sort((a, b) => b.borrowed - a.borrowed);
  }, [allUsers, loans, loanPayments, selectedYear, isAdmin, userEmail]);

  // 3. Member-wise Loan Disbursements by Month Data (for Admin)
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

    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
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

  return (
    <div className={cn("space-y-8 pb-12", isAndroid && "space-y-4 pb-8 px-1")}>
      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-8", isAndroid && "gap-4")}>
        
        {/* Month-wise Sanctioned Loans & Repayments Chart (Admin Only) */}
        {isAdmin && (
          <div className={cn(
            "bg-gradient-to-b from-indigo-50/30 via-white to-white p-6 sm:p-7 rounded-3xl border-2 border-indigo-100/90 shadow-sm hover:shadow-md hover:border-indigo-200/90 lg:col-span-2 relative overflow-hidden transition-all",
            isAndroid && "p-4 overflow-hidden"
          )}>
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-indigo-50/90 text-xs font-black text-indigo-700 rounded-bl-2xl border-b border-l border-indigo-200/80 shadow-2xs z-10 select-none">
              #1
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
                      Month-wise Loan Sanctions & Repayments ({selectedYear})
                    </h3>
                    <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                      {collapsedGraphs['sanctions-repayments'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Comparison of loan amounts sanctioned vs total loan repayments received in {selectedYear}
                  </p>
                </div>
              </div>

              {/* KPI Pills */}
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="px-3.5 py-1.5 bg-indigo-50/80 border border-indigo-100/80 rounded-xl flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sanctioned ({selectedYear}):</span>
                  <span className="text-xs font-black text-indigo-700">₹{totalSanctionedSum.toLocaleString('en-IN')}</span>
                </div>
                <div className="px-3.5 py-1.5 bg-emerald-50/80 border border-emerald-100/80 rounded-xl flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Repayments ({selectedYear}):</span>
                  <span className="text-xs font-black text-emerald-700">₹{totalRepaymentsSum.toLocaleString('en-IN')}</span>
                </div>
                <div className="px-3.5 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Sanctions Count:</span>
                  <span className="text-xs font-black text-slate-700">{totalSanctionedCount}</span>
                </div>
                <div className="px-3.5 py-1.5 bg-slate-50 border border-slate-200/80 rounded-xl flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Repayments Count:</span>
                  <span className="text-xs font-black text-slate-700">{totalRepaymentsCount}</span>
                </div>
              </div>
            </div>

            {!collapsedGraphs['sanctions-repayments'] && (
              monthlySanctionedLoansData.length > 0 ? (
                <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain pb-2 scrollbar-thin">
                  <div 
                    style={{ minWidth: `${getDynamicChartWidth(monthlySanctionedLoansData.length)}px`, width: '100%' }} 
                    className={cn("h-[380px] mt-2", isAndroid && "h-[310px]")}
                  >
                    <ResponsiveContainer width="99%" height="100%">
                      <BarChart 
                        data={monthlySanctionedLoansData} 
                        margin={isAndroid ? { top: 28, right: 10, left: 0, bottom: 40 } : { top: 32, right: 30, left: 20, bottom: 40 }}
                      >
                        <defs>
                          <linearGradient id="sanctionedBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                            <stop offset="100%" stopColor="#4338ca" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="repaidBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="monthInterestBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                            <stop offset="100%" stopColor="#d97706" stopOpacity={0.95} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="name" 
                          tick={{ fontSize: isAndroid ? 10 : 12, fill: '#475569', fontWeight: 600 }}
                          dy={10}
                        />
                        <YAxis 
                          tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} 
                          width={isAndroid ? 50 : 70} 
                          tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} 
                        />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const item = monthlySanctionedLoansData.find(d => d.name === label) || payload[0]?.payload;
                            const sanctionedVal = item?.sanctionedAmount || 0;
                            const principalVal = item?.repaymentPrincipal || 0;
                            const interestVal = item?.repaymentInterest || 0;
                            const totalRepaidVal = item?.repaidAmount || 0;
                            const sanctionCount = item?.sanctionCount || 0;
                            const repaymentCount = item?.repaymentCount || 0;

                            return (
                              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2.5 min-w-[250px]">
                                <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between gap-2">
                                  <p className="text-xs font-bold text-slate-900">
                                    Month: <span className="text-indigo-800">{label}</span>
                                  </p>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-indigo-600" />
                                      <span className="font-bold text-indigo-600">Sanctioned Loan:</span>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-black text-indigo-600 block">
                                        ₹{sanctionedVal.toLocaleString('en-IN')}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-normal">
                                        ({sanctionCount} loan{sanctionCount !== 1 ? 's' : ''})
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500" />
                                      <span className="font-bold text-emerald-700">Principal Repaid:</span>
                                    </div>
                                    <span className="font-black text-emerald-700">
                                      ₹{principalVal.toLocaleString('en-IN')}
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-500" />
                                      <span className="font-bold text-amber-700">Interest Collected (0.5%):</span>
                                    </div>
                                    <span className="font-black text-amber-700">
                                      ₹{interestVal.toLocaleString('en-IN')}
                                    </span>
                                  </div>

                                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between font-black">
                                    <div className="flex items-center gap-1">
                                      <span className="text-slate-700">Total Repayment:</span>
                                      <span className="text-[10px] text-slate-400 font-normal">
                                        ({repaymentCount} payment{repaymentCount !== 1 ? 's' : ''})
                                      </span>
                                    </div>
                                    <span className="text-emerald-800">
                                      ₹{totalRepaidVal.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend 
                          wrapperStyle={{ paddingTop: '15px' }}
                          formatter={(value) => <span className="text-xs font-bold text-slate-700">{value}</span>}
                        />
                        <Bar 
                          dataKey="sanctionedAmount" 
                          name="Sanctioned Loan" 
                          fill="url(#sanctionedBarGradient)" 
                          radius={[8, 8, 0, 0]} 
                          maxBarSize={45}
                        >
                          <LabelList 
                            dataKey="sanctionedAmount" 
                            position="top" 
                            formatter={formatBarAmountValue} 
                            style={{ fontSize: isAndroid ? 9 : 11, fontWeight: 700, fill: '#4338ca' }}
                          />
                        </Bar>
                        <Bar 
                          dataKey="repaymentPrincipal" 
                          name="Principal Repaid" 
                          stackId="repaymentStack"
                          fill="url(#repaidBarGradient)" 
                          radius={[8, 8, 0, 0]} 
                          maxBarSize={45}
                        />
                        <Bar 
                          dataKey="repaymentInterest" 
                          name="Interest Collected (0.5%)" 
                          stackId="repaymentStack"
                          fill="url(#monthInterestBarGradient)" 
                          radius={[8, 8, 0, 0]} 
                          maxBarSize={45}
                        >
                          <LabelList 
                            dataKey="repaidAmount" 
                            position="top" 
                            formatter={formatBarAmountValue} 
                            style={{ fontSize: isAndroid ? 9 : 11, fontWeight: 700, fill: '#059669' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <HandCoins className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Loan Activity in {selectedYear}</p>
                  <p className="text-xs text-slate-400 mt-1">Once loans are approved or repayments are recorded for {selectedYear}, data will be charted here.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Member-wise Loan Disbursements by Month Chart (Admin Only) */}
        {isAdmin && (
          <div className={cn(
            "bg-gradient-to-b from-violet-50/30 via-white to-white p-6 sm:p-7 rounded-3xl border-2 border-violet-100/90 shadow-sm hover:shadow-md hover:border-violet-200/90 lg:col-span-2 relative overflow-hidden transition-all",
            isAndroid && "p-4 overflow-hidden"
          )}>
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-violet-50/90 text-xs font-black text-violet-700 rounded-bl-2xl border-b border-l border-violet-200/80 shadow-2xs z-10 select-none">
              #2
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
                  <Users className="w-5 h-5" />
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
                    Breakdown of member loans in {selectedYear} (Green: Closed / Settled Loans, Violet: Active Loans)
                  </p>
                </div>
              </div>

              {/* Status Indicator Badges & Month Selector Pills */}
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {/* Active vs Closed Legend Indicator */}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-xl border border-slate-200 text-[11px] font-bold">
                  <span className="flex items-center gap-1 text-violet-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-violet-600" />
                    Active Loans
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="flex items-center gap-1 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                    Closed Loans
                  </span>
                </div>

                {availableLoanMonths.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setSelectedLoanMonthFilter('all')}
                      className={cn(
                        "px-3 py-1 text-xs font-bold rounded-xl transition-all",
                        selectedLoanMonthFilter === 'all'
                          ? "bg-white text-violet-700 shadow-sm border border-slate-200/80"
                          : "text-slate-600 hover:text-slate-900"
                      )}
                    >
                      All Months ({memberLoansByMonth.length})
                    </button>
                    {availableLoanMonths.map(monthLabel => {
                      const count = memberLoansByMonth.filter(l => l.monthLabel === monthLabel).length;
                      return (
                        <button
                          key={monthLabel}
                          type="button"
                          onClick={() => setSelectedLoanMonthFilter(monthLabel)}
                          className={cn(
                            "px-3 py-1 text-xs font-bold rounded-xl transition-all",
                            selectedLoanMonthFilter === monthLabel
                              ? "bg-white text-violet-700 shadow-sm border border-slate-200/80"
                              : "text-slate-600 hover:text-slate-900"
                          )}
                        >
                          {monthLabel} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {!collapsedGraphs['member-disbursements'] && (
              filteredMemberLoansByMonth.length > 0 ? (
                <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain pb-2 scrollbar-thin">
                  <div 
                    style={{ minWidth: `${getDynamicChartWidth(filteredMemberLoansByMonth.length)}px`, width: '100%' }} 
                    className={cn("h-[380px] mt-2", isAndroid && "h-[310px]")}
                  >
                    <ResponsiveContainer width="99%" height="100%">
                      <BarChart 
                        data={filteredMemberLoansByMonth} 
                        margin={isAndroid ? { top: 25, right: 10, left: 0, bottom: 65 } : { top: 30, right: 30, left: 20, bottom: 65 }}
                      >
                        <defs>
                          <linearGradient id="memberLoanBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                            <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="closedLoanBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey={selectedLoanMonthFilter === 'all' ? "displayNameWithMonth" : "memberName"} 
                          angle={-35} 
                          textAnchor="end" 
                          interval={0} 
                          height={isAndroid ? 55 : 65}
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#475569', fontWeight: 600 }}
                          tickFormatter={(val) => {
                            const limit = isAndroid ? 12 : 20;
                            return val.length > limit ? val.substring(0, limit - 2) + ".." : val;
                          }}
                        />
                        <YAxis 
                          tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} 
                          width={isAndroid ? 50 : 70} 
                          tickFormatter={(val) => `₹${Number(val).toLocaleString('en-IN')}`} 
                        />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const data = payload[0]?.payload;
                            const memberName = data?.memberName || label;
                            const numVal = Number(data?.amount || payload[0]?.value) || 0;
                            const monthLabel = data?.monthLabel || '';
                            const isClosed = data?.status === 'paid';

                            return (
                              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2.5 min-w-[220px]">
                                <div className="border-b border-slate-100 pb-1.5 flex items-center justify-between gap-2">
                                  <p className="text-xs font-bold text-slate-900">
                                    Member: {memberName}
                                  </p>
                                  <span className={cn(
                                    "text-[10px] font-extrabold px-2 py-0.5 rounded-full border",
                                    isClosed 
                                      ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                                      : "bg-violet-50 text-violet-700 border-violet-200"
                                  )}>
                                    {isClosed ? 'Closed Loan' : 'Active Loan'}
                                  </span>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", isClosed ? "bg-emerald-500" : "bg-violet-600")} />
                                      <span className={cn("font-bold", isClosed ? "text-emerald-700" : "text-violet-600")}>
                                        Loan Disbursed:
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className={cn("font-black block", isClosed ? "text-emerald-700" : "text-violet-600")}>
                                        ₹{numVal.toLocaleString('en-IN')}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-normal">
                                        ({monthLabel})
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar 
                          dataKey="amount" 
                          name="Loan Amount" 
                          radius={[8, 8, 0, 0]} 
                          maxBarSize={50}
                        >
                          {filteredMemberLoansByMonth.map((entry, index) => (
                            <Cell 
                              key={`cell-disburse-${entry.id || index}`} 
                              fill={entry.status === 'paid' ? "url(#closedLoanBarGradient)" : "url(#memberLoanBarGradient)"} 
                            />
                          ))}
                          <LabelList 
                            dataKey="amount" 
                            position="top" 
                            formatter={formatBarAmountValue} 
                            style={{ fontSize: isAndroid ? 9 : 11, fontWeight: 700, fill: '#4b5563' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Member Loan Disbursements in {selectedYear}</p>
                  <p className="text-xs text-slate-400 mt-1">Once member loans are approved for {selectedYear}, month-wise member records will be plotted here.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Personal Contributions for Members */}
        {!isAdmin && (
          <div className={cn(
            "bg-gradient-to-b from-blue-50/30 via-white to-white p-6 rounded-3xl border-2 border-blue-100/90 shadow-sm hover:shadow-md hover:border-blue-200/90 lg:col-span-2 relative overflow-hidden transition-all",
            isAndroid && "p-4 overflow-hidden"
          )}>
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-blue-50/90 text-xs font-black text-blue-700 rounded-bl-2xl border-b border-l border-blue-200/80 shadow-2xs z-10 select-none">
              #1
            </div>

            <div
              onClick={() => toggleGraph('contribution-history')}
              className={cn(
                "flex items-center justify-between cursor-pointer group select-none transition-colors pr-10 sm:pr-12",
                !collapsedGraphs['contribution-history'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                  Your Contribution History ({selectedYear})
                </h3>
                <span className="text-slate-400 group-hover:text-blue-600 transition-colors">
                  {collapsedGraphs['contribution-history'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </span>
              </div>
            </div>
            {!collapsedGraphs['contribution-history'] && (
              memberContributionsData.length > 0 ? (
                <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain pb-2 scrollbar-thin">
                  <div 
                    style={{ minWidth: `${getDynamicChartWidth(memberContributionsData.length)}px`, width: '100%' }} 
                    className={cn("h-[370px]", isAndroid && "h-[300px]")}
                  >
                    <ResponsiveContainer width="99%" height="100%">
                      <BarChart data={memberContributionsData} margin={isAndroid ? { top: 28, right: 10, left: 0, bottom: 60 } : { top: 32, right: 30, left: 20, bottom: 80 }}>
                        <defs>
                          <linearGradient id="personalContribGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                            <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.9} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="uniqueId" 
                          angle={-45} 
                          textAnchor="end" 
                          interval={0} 
                          height={isAndroid ? 60 : 80}
                          tick={{ fontSize: isAndroid ? 9 : 10, fill: '#64748b' }}
                          tickFormatter={(id) => {
                            const item = memberContributionsData.find(d => d.uniqueId === id);
                            let val = item?.name || 'Unknown';
                            val = val.split(/[@(]/)[0].trim();
                            const limit = isAndroid ? 8 : 12;
                            return val.length > limit ? val.substring(0, limit - 2) + ".." : val;
                          }}
                        />
                        <YAxis tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} width={isAndroid ? 45 : 60} tickFormatter={(val) => Number(val).toLocaleString('en-IN')} />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const item = memberContributionsData.find(d => d.uniqueId === label) || payload[0]?.payload;
                            const numVal = Number(payload[0]?.value) || 0;
                            return (
                              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2.5 min-w-[200px]">
                                <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
                                  Month: {item?.name || label}
                                </p>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-blue-600" />
                                      <span className="font-bold text-blue-600">
                                        Contribution:
                                      </span>
                                    </div>
                                    <span className="font-black text-blue-600">
                                      ₹{numVal.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="amount" fill="url(#personalContribGradient)" radius={[8, 8, 0, 0]}>
                          <LabelList 
                            dataKey="amount" 
                            position="top" 
                            formatter={formatBarAmountValue} 
                            style={{ fontSize: isAndroid ? 9 : 11, fontWeight: 700, fill: '#1d4ed8' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Contributions Found in {selectedYear}</p>
                  <p className="text-xs text-slate-400 mt-1">Once contributions for {selectedYear} are paid, they will appear here.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Member vs Loan Received vs Paid (Includes Active & Closed Loans) */}
        {(isAdmin || (memberLoans.length > 0 && (memberLoans[0].borrowed > 0 || memberLoans[0].repaid > 0))) && (
          <div className={cn(
            "bg-gradient-to-b from-cyan-50/30 via-white to-white p-6 rounded-3xl border-2 border-cyan-100/90 shadow-sm hover:shadow-md hover:border-cyan-200/90 lg:col-span-2 relative overflow-hidden transition-all",
            isAndroid && "p-4 overflow-hidden"
          )}>
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-cyan-50/90 text-xs font-black text-cyan-800 rounded-bl-2xl border-b border-l border-cyan-200/80 shadow-2xs z-10 select-none">
              {isAdmin ? '#3' : '#2'}
            </div>

            <div
              onClick={() => toggleGraph('borrowed-repaid')}
              className={cn(
                "flex items-center justify-between cursor-pointer group select-none transition-colors pr-10 sm:pr-12",
                !collapsedGraphs['borrowed-repaid'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-cyan-700 transition-colors">
                  Memberwise Borrowed vs Repaid ({selectedYear})
                </h3>
                <span className="text-slate-400 group-hover:text-cyan-700 transition-colors">
                  {collapsedGraphs['borrowed-repaid'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </span>
              </div>
            </div>
            {!collapsedGraphs['borrowed-repaid'] && (
              memberLoans.length > 0 ? (
                <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain pb-2 scrollbar-thin">
                  <div 
                    style={{ minWidth: `${getDynamicChartWidth(memberLoans.length)}px`, width: '100%' }} 
                    className={cn("h-[420px]", isAndroid && "h-[320px]")}
                  >
                    <ResponsiveContainer width="99%" height="100%">
                      <BarChart data={memberLoans} margin={isAndroid ? { top: 28, right: 10, left: 0, bottom: 60 } : { top: 32, right: 30, left: 20, bottom: 80 }}>
                        <defs>
                          <linearGradient id="borrowedBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                            <stop offset="100%" stopColor="#4338ca" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="repaidMemberBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                            <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                          </linearGradient>
                          <linearGradient id="memberInterestPaidGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                            <stop offset="100%" stopColor="#d97706" stopOpacity={0.95} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="uniqueId" 
                          angle={-45} 
                          textAnchor="end" 
                          interval={0} 
                          height={isAndroid ? 60 : 80}
                          tick={{ fontSize: isAndroid ? 9 : 10, fill: '#64748b' }}
                          tickFormatter={(id) => {
                            const item = memberLoans.find(d => d.uniqueId === id);
                            let val = item?.name || 'Unknown';
                            val = val.split(/[@(]/)[0].trim();
                            const totalCount = item?.totalLoans ?? 0;
                            const labelWithCount = `${val} (${totalCount})`;
                            const limit = isAndroid ? 10 : 16;
                            return labelWithCount.length > limit ? labelWithCount.substring(0, limit - 2) + ".." : labelWithCount;
                          }}
                        />
                        <YAxis tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} width={isAndroid ? 45 : 60} tickFormatter={(val) => Number(val).toLocaleString('en-IN')} />
                        <Tooltip 
                          content={({ active, payload, label }) => {
                            if (!active || !payload || !payload.length) return null;
                            const item = memberLoans.find(d => d.uniqueId === label) || payload[0]?.payload;
                            return (
                              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2.5 min-w-[250px]">
                                <div className="border-b border-slate-100 pb-2">
                                  <p className="text-xs font-bold text-slate-900 flex items-center justify-between gap-2">
                                    <span>Member: <span className="text-cyan-800">{item?.name || label}</span></span>
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200 shrink-0">
                                      {item?.totalLoans ?? 0} loans ({item?.activeLoans ?? 0} active, {item?.closedLoans ?? 0} closed)
                                    </span>
                                  </p>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-indigo-600" />
                                      <span className="font-bold text-indigo-600">Borrowed (All Loans):</span>
                                    </div>
                                    <span className="font-black text-indigo-600">₹{(item?.borrowed || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-emerald-500" />
                                      <span className="font-bold text-emerald-700">Principal Repaid:</span>
                                    </div>
                                    <span className="font-black text-emerald-700">₹{(item?.repaidPrincipal || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-500" />
                                      <span className="font-bold text-amber-700">Interest Paid (0.5%):</span>
                                    </div>
                                    <span className="font-black text-amber-700">₹{(item?.interestPaid || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between font-black">
                                    <span className="text-slate-700">Total Repaid:</span>
                                    <span className="text-emerald-800">₹{(item?.totalRepaid || 0).toLocaleString('en-IN')}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <Legend wrapperStyle={isAndroid ? { fontSize: '10px' } : undefined} />
                        <Bar dataKey="borrowed" name="Borrowed (All Loans)" fill="url(#borrowedBarGradient)" radius={[8, 8, 0, 0]} maxBarSize={45}>
                          <LabelList 
                            dataKey="borrowed" 
                            position="top" 
                            formatter={formatBarAmountValue} 
                            style={{ fontSize: isAndroid ? 9 : 11, fontWeight: 700, fill: '#4338ca' }}
                          />
                        </Bar>
                        <Bar dataKey="repaidPrincipal" name="Principal Repaid" stackId="repaidStack" fill="url(#repaidMemberBarGradient)" radius={[8, 8, 0, 0]} maxBarSize={45} />
                        <Bar dataKey="interestPaid" name="Interest Paid (0.5%)" stackId="repaidStack" fill="url(#memberInterestPaidGradient)" radius={[8, 8, 0, 0]} maxBarSize={45}>
                          <LabelList 
                            dataKey="totalRepaid" 
                            position="top" 
                            formatter={formatBarAmountValue} 
                            style={{ fontSize: isAndroid ? 9 : 11, fontWeight: 700, fill: '#059669' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="py-16 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <HandCoins className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Borrowed or Repaid Loans in {selectedYear}</p>
                  <p className="text-xs text-slate-400 mt-1">Once loans or repayments for {selectedYear} exist, they will be compared here.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Group Financial Health (Area/Bar Chart) */}
        {isAdmin && (
          <div className={cn(
            "bg-gradient-to-b from-indigo-50/20 via-white to-white p-6 rounded-3xl border-2 border-indigo-100/90 shadow-sm hover:shadow-md hover:border-indigo-200/90 lg:col-span-2 relative overflow-hidden transition-all",
            isAndroid && "p-4 overflow-hidden"
          )}>
            {/* Top-Right Index Badge */}
            <div className="absolute top-0 right-0 px-3.5 py-1.5 bg-indigo-50/90 text-xs font-black text-indigo-800 rounded-bl-2xl border-b border-l border-indigo-200/80 shadow-2xs z-10 select-none">
              #4
            </div>

            <div
              onClick={() => toggleGraph('financial-health')}
              className={cn(
                "flex items-center justify-between cursor-pointer group select-none transition-colors pr-10 sm:pr-12",
                !collapsedGraphs['financial-health'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">
                  Financial Health Overview ({selectedYear})
                </h3>
                <span className="text-slate-400 group-hover:text-indigo-700 transition-colors">
                  {collapsedGraphs['financial-health'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </span>
              </div>
            </div>

            {!collapsedGraphs['financial-health'] && (
              <div className="space-y-6">
                {/* 5 KPI Metric Cards Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                  {/* 1. Total Group Funds */}
                  <div className="bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-white p-3.5 sm:p-4 rounded-2xl border border-indigo-200/80 shadow-2xs">
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="text-[11px] sm:text-xs font-bold text-indigo-900 uppercase tracking-tight line-clamp-1">Total Group Funds</span>
                      <div className="p-1.5 rounded-lg bg-indigo-100/80 text-indigo-700 shrink-0">
                        <Landmark className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <p className="text-base sm:text-lg lg:text-xl font-black text-indigo-950 tracking-tight">
                      ₹{financialHealthData.totalGroupFunds.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-indigo-700/80 font-semibold mt-0.5 truncate">
                      Savings + Interest
                    </p>
                  </div>

                  {/* 2. Loans Sanctioned */}
                  <div className="bg-gradient-to-br from-violet-50/90 via-violet-50/40 to-white p-3.5 sm:p-4 rounded-2xl border border-violet-200/80 shadow-2xs">
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="text-[11px] sm:text-xs font-bold text-violet-900 uppercase tracking-tight line-clamp-1">Loans Sanctioned</span>
                      <div className="p-1.5 rounded-lg bg-violet-100/80 text-violet-700 shrink-0">
                        <HandCoins className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <p className="text-base sm:text-lg lg:text-xl font-black text-violet-950 tracking-tight">
                      ₹{financialHealthData.loansSanctioned.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-violet-700/80 font-semibold mt-0.5 truncate">
                      Approved Principal
                    </p>
                  </div>

                  {/* 3. Loans Repaid */}
                  <div className="bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white p-3.5 sm:p-4 rounded-2xl border border-emerald-200/80 shadow-2xs">
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="text-[11px] sm:text-xs font-bold text-emerald-900 uppercase tracking-tight line-clamp-1">Loans Repaid</span>
                      <div className="p-1.5 rounded-lg bg-emerald-100/80 text-emerald-700 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <p className="text-base sm:text-lg lg:text-xl font-black text-emerald-950 tracking-tight">
                      ₹{financialHealthData.loansRepaid.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-emerald-700/80 font-semibold mt-0.5 truncate">
                      Principal Recovered
                    </p>
                  </div>

                  {/* 4. Outstanding Loans */}
                  <div className="bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white p-3.5 sm:p-4 rounded-2xl border border-rose-200/80 shadow-2xs">
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="text-[11px] sm:text-xs font-bold text-rose-900 uppercase tracking-tight line-clamp-1">Outstanding Loans</span>
                      <div className="p-1.5 rounded-lg bg-rose-100/80 text-rose-700 shrink-0">
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <p className="text-base sm:text-lg lg:text-xl font-black text-rose-950 tracking-tight">
                      ₹{financialHealthData.outstandingLoans.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-rose-700/80 font-semibold mt-0.5 truncate">
                      Active Balance Due
                    </p>
                  </div>

                  {/* 5. Available Balance */}
                  <div className="bg-gradient-to-br from-cyan-50/90 via-cyan-50/40 to-white p-3.5 sm:p-4 rounded-2xl border border-cyan-200/80 shadow-2xs col-span-2 sm:col-span-1">
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="text-[11px] sm:text-xs font-bold text-cyan-900 uppercase tracking-tight line-clamp-1">Available Balance</span>
                      <div className="p-1.5 rounded-lg bg-cyan-100/80 text-cyan-700 shrink-0">
                        <ShieldCheck className="w-3.5 h-3.5" />
                      </div>
                    </div>
                    <p className="text-base sm:text-lg lg:text-xl font-black text-cyan-950 tracking-tight">
                      ₹{financialHealthData.availableBalance.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-cyan-700/80 font-semibold mt-0.5 truncate">
                      Net Pool Liquidity
                    </p>
                  </div>
                </div>

                {/* Multi-Bar Graph */}
                <div className="overflow-x-auto w-full touch-pan-x overscroll-x-contain pb-2 scrollbar-thin">
                  <div 
                    style={{ minWidth: `${getDynamicChartWidth(financialHealthData.chartData.length)}px`, width: '100%' }} 
                    className={cn("h-[400px]", isAndroid && "h-[330px]")}
                  >
                    <ResponsiveContainer width="99%" height="100%">
                      <BarChart 
                        data={financialHealthData.chartData} 
                        margin={isAndroid ? { top: 28, right: 10, left: 0, bottom: 50 } : { top: 32, right: 30, left: 20, bottom: 40 }}
                      >
                        <defs>
                          <linearGradient id="healthTotalFundsGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4f46e5" stopOpacity={1} />
                            <stop offset="100%" stopColor="#312e81" stopOpacity={0.95} />
                          </linearGradient>
                          <linearGradient id="healthLoansSanctionedGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                            <stop offset="100%" stopColor="#5b21b6" stopOpacity={0.95} />
                          </linearGradient>
                          <linearGradient id="healthLoansRepaidGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                            <stop offset="100%" stopColor="#065f46" stopOpacity={0.95} />
                          </linearGradient>
                          <linearGradient id="healthOutstandingGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
                            <stop offset="100%" stopColor="#9f1239" stopOpacity={0.95} />
                          </linearGradient>
                          <linearGradient id="healthAvailableGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#06b6d4" stopOpacity={1} />
                            <stop offset="100%" stopColor="#0e7490" stopOpacity={0.95} />
                          </linearGradient>
                          <linearGradient id="healthInterestGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                            <stop offset="100%" stopColor="#d97706" stopOpacity={1} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="category" 
                          interval={0} 
                          angle={isAndroid ? -30 : 0} 
                          textAnchor={isAndroid ? "end" : "middle"} 
                          height={isAndroid ? 60 : 40}
                          tick={{ fontSize: isAndroid ? 10 : 11, fill: '#334155', fontWeight: 700 }}
                          tickFormatter={(cat) => {
                            if (isAndroid && cat.length > 15) {
                              return cat.replace('Total Group Funds', 'Total Funds').replace('Outstanding Loans', 'Outstanding');
                            }
                            return cat;
                          }}
                        />
                        <YAxis tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} width={isAndroid ? 45 : 60} tickFormatter={(val) => Number(val).toLocaleString('en-IN')} />
                        <Tooltip 
                          content={({ active, payload }) => {
                            if (!active || !payload || !payload.length) return null;
                            const data = payload[0]?.payload;
                            const isTotalFunds = data?.key === 'totalFunds';

                            return (
                              <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xl space-y-2.5 min-w-[250px]">
                                <div className="border-b border-slate-100 pb-2 flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-xs font-black text-slate-900">
                                      {data?.category}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-semibold">
                                      {data?.subtitle}
                                    </p>
                                  </div>
                                  <span className="text-xs font-black px-2 py-0.5 rounded-lg" style={{ color: data?.color, backgroundColor: `${data?.color}15` }}>
                                    ₹{(data?.totalAmount || 0).toLocaleString('en-IN')}
                                  </span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  {isTotalFunds ? (
                                    <>
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-indigo-600" />
                                          <span className="font-bold text-indigo-700">Member Savings:</span>
                                        </div>
                                        <span className="font-black text-indigo-700">₹{(data?.baseAmount || 0).toLocaleString('en-IN')}</span>
                                      </div>
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-1.5">
                                          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-amber-500" />
                                          <span className="font-bold text-amber-700">Interest Received (0.5%):</span>
                                        </div>
                                        <span className="font-black text-amber-700">₹{(data?.interestAmount || 0).toLocaleString('en-IN')}</span>
                                      </div>
                                      <div className="pt-1 border-t border-slate-100 flex items-center justify-between font-black">
                                        <span className="text-slate-700">Total Group Funds:</span>
                                        <span className="text-indigo-900">₹{(data?.totalAmount || 0).toLocaleString('en-IN')}</span>
                                      </div>
                                    </>
                                  ) : (
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: data?.color }} />
                                        <span className="font-bold" style={{ color: data?.color }}>{data?.category}:</span>
                                      </div>
                                      <span className="font-black" style={{ color: data?.color }}>
                                        ₹{(data?.totalAmount || 0).toLocaleString('en-IN')}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }}
                        />
                        
                        <Bar dataKey="baseAmount" name="Base Amount" stackId="healthStack" radius={[8, 8, 0, 0]} maxBarSize={55}>
                          {financialHealthData.chartData.map((entry, index) => (
                            <Cell 
                              key={`cell-health-base-${entry.key || index}`} 
                              fill={entry.fill} 
                            />
                          ))}
                        </Bar>
                        <Bar dataKey="interestAmount" name="Interest Received" stackId="healthStack" fill="url(#healthInterestGradient)" radius={[8, 8, 0, 0]} maxBarSize={55}>
                          {financialHealthData.chartData.map((entry, index) => (
                            <Cell 
                              key={`cell-health-interest-${entry.key || index}`} 
                              fill={entry.key === 'totalFunds' ? "url(#healthInterestGradient)" : "transparent"} 
                            />
                          ))}
                          <LabelList 
                            dataKey="totalAmount" 
                            position="top" 
                            formatter={formatBarAmountValue} 
                            style={{ fontSize: isAndroid ? 9 : 11, fontWeight: 700, fill: '#1e293b' }}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Summary Indicator Legend */}
                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 pt-3 text-xs font-bold select-none border-t border-slate-100 mt-2">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-md bg-indigo-600 shadow-2xs" />
                      <span className="text-slate-700">Total Group Funds</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-md bg-amber-500 shadow-2xs" />
                      <span className="text-amber-800">Interest Received (0.5%)</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-md bg-violet-600 shadow-2xs" />
                      <span className="text-slate-700">Loans Sanctioned</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-md bg-emerald-500 shadow-2xs" />
                      <span className="text-slate-700">Loans Repaid</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-md bg-rose-500 shadow-2xs" />
                      <span className="text-slate-700">Outstanding Loans</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-md bg-cyan-500 shadow-2xs" />
                      <span className="text-slate-700">Available Balance</span>
                    </div>
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
