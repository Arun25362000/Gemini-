import React from 'react';
import { 
  BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { HandCoins, TrendingUp, Calendar, CheckCircle2, Users, UserCheck, ChevronDown, ChevronUp } from 'lucide-react';
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

const Graphs: React.FC<GraphsProps> = ({ allUsers, contributions, loans, loanPayments, financials, userEmail, isAdmin }) => {
  const [isMobileScreen, setIsMobileScreen] = React.useState(false);
  const [selectedLoanMonthFilter, setSelectedLoanMonthFilter] = React.useState<string>('all');
  const [collapsedGraphs, setCollapsedGraphs] = React.useState<Record<string, boolean>>({});

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

  // Personal Monthly Contributions (Member)
  const memberContributionsData = Object.values(
    contributions
      .filter(c => c.userEmail?.toLowerCase() === userEmail.toLowerCase() && c.year >= 2026)
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
  ).sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

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

  // Month-wise Sanctioned Loans & Repayments Data (for Admin)
  const sanctionedLoans = loans.filter(l => l.status === 'approved' || l.status === 'paid');
  const paidLoanPaymentsList = loanPayments.filter(p => p.status === 'paid');
  
  const totalSanctionedSum = sanctionedLoans.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
  const totalSanctionedCount = sanctionedLoans.length;

  const totalRepaymentsSum = paidLoanPaymentsList.reduce((sum, p) => sum + (p.amount || 0) + (p.interest || 0), 0);
  const totalRepaymentsCount = paidLoanPaymentsList.length;

  const monthlySanctionedLoansData = React.useMemo(() => {
    const map: Record<string, { 
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

    // 1. Accumulate Sanctioned Loans
    sanctionedLoans.forEach(l => {
      const date = getLoanSanctionDate(l);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const name = `${MONTH_NAMES[month]} ${year}`;
      const amount = l.approvedAmount || l.amount || 0;

      if (!map[key]) {
        map[key] = {
          key,
          name,
          month,
          year,
          sanctionedAmount: 0,
          sanctionCount: 0,
          repaidAmount: 0,
          repaymentCount: 0,
          repaymentPrincipal: 0,
          repaymentInterest: 0
        };
      }
      map[key].sanctionedAmount += amount;
      map[key].sanctionCount += 1;
    });

    // 2. Accumulate Repayments Received
    paidLoanPaymentsList.forEach(p => {
      const month = p.month || (p.timestamp?.toDate ? p.timestamp.toDate().getMonth() + 1 : new Date().getMonth() + 1);
      const year = p.year || (p.timestamp?.toDate ? p.timestamp.toDate().getFullYear() : new Date().getFullYear());
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const name = `${MONTH_NAMES[month]} ${year}`;
      const principal = p.amount || 0;
      const interest = p.interest || 0;
      const totalRepaid = principal + interest;

      if (!map[key]) {
        map[key] = {
          key,
          name,
          month,
          year,
          sanctionedAmount: 0,
          sanctionCount: 0,
          repaidAmount: 0,
          repaymentCount: 0,
          repaymentPrincipal: 0,
          repaymentInterest: 0
        };
      }
      map[key].repaidAmount += totalRepaid;
      map[key].repaymentCount += 1;
      map[key].repaymentPrincipal += principal;
      map[key].repaymentInterest += interest;
    });

    return Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
  }, [loans, loanPayments]);

  // 2. Member vs Loan Received and Paid (Active Loans only)
  const memberLoans = allUsers
    .filter(u => u.email?.toLowerCase() !== 'unnati.finance2026@gmail.com')
    .map((u, uidx) => {
      const userLoans = loans.filter(l => l.userEmail?.toLowerCase() === u.email?.toLowerCase() && l.status === 'approved');
      const totalBorrowed = userLoans.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
      
      const totalRepaid = loanPayments
        .filter(p => {
          const loan = loans.find(l => l.id === p.loanId);
          return loan?.userEmail?.toLowerCase() === u.email?.toLowerCase() && loan?.status === 'approved' && p.status === 'paid';
        })
        .reduce((sum, p) => sum + p.amount, 0);

      const baseName = u.displayName || `Member ${uidx + 1}`;
      const uniqueId = `${u.uid || u.email || 'loan-user'}-${uidx}`;
      
      return {
        name: baseName,
        email: u.email?.toLowerCase(),
        uniqueId: uniqueId,
        borrowed: totalBorrowed,
        repaid: totalRepaid
      };
    })
    .filter(d => isAdmin ? d.borrowed > 0 : d.email === userEmail.toLowerCase())
    .sort((a, b) => b.borrowed - a.borrowed);

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

    sanctionedLoans.forEach((l, idx) => {
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
        status: l.status as 'approved' | 'paid',
        displayNameWithMonth: `${memberName} (${MONTH_NAMES[month]} '${String(year).slice(-2)})`,
        uniqueKey: `${l.id || idx}-${memberName}-${month}-${year}`
      });
    });

    return list.sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [sanctionedLoans, allUsers]);

  // Grouped by Month for Summary Cards
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

    return Object.values(groups).sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));
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

  const savingsVsLoans = [
    {
      name: 'Comparison',
      savings: financials.totalSavings,
      loans: financials.outstandingPrincipal,
      available: financials.availableBalance
    }
  ];

  return (
    <div className={cn("space-y-8 pb-12", isAndroid && "space-y-4 pb-8 px-1")}>
      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-8", isAndroid && "gap-4")}>
        
        {/* Month-wise Sanctioned Loans & Repayments Chart (Admin Only) */}
        {isAdmin && (
          <div className={cn(
            "bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2 relative overflow-hidden transition-all",
            isAndroid && "p-4 overflow-hidden"
          )}>
            <div 
              onClick={() => toggleGraph('sanctions-repayments')}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group select-none transition-colors",
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
                      Month-wise Loan Sanctions & Repayments
                    </h3>
                    <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                      {collapsedGraphs['sanctions-repayments'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Comparison of loan amounts sanctioned vs total loan repayments received per month
                  </p>
                </div>
              </div>

              {/* KPI Pills (Average Loan Size removed as requested) */}
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <div className="px-3.5 py-1.5 bg-indigo-50/80 border border-indigo-100/80 rounded-xl flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Sanctioned:</span>
                  <span className="text-xs font-black text-indigo-700">₹{totalSanctionedSum.toLocaleString('en-IN')}</span>
                </div>
                <div className="px-3.5 py-1.5 bg-emerald-50/80 border border-emerald-100/80 rounded-xl flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Repayments:</span>
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
                <div className={cn("h-[360px] w-full mt-2", isAndroid && "h-[290px]")}>
                  <ResponsiveContainer width="99%" height="100%">
                    <BarChart 
                      data={monthlySanctionedLoansData} 
                      margin={isAndroid ? { top: 15, right: 10, left: 0, bottom: 40 } : { top: 20, right: 30, left: 20, bottom: 40 }}
                    >
                      <defs>
                        <linearGradient id="sanctionedBarGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity={1} />
                          <stop offset="100%" stopColor="#4338ca" stopOpacity={0.85} />
                        </linearGradient>
                        <linearGradient id="repaidBarGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                          <stop offset="100%" stopColor="#059669" stopOpacity={0.85} />
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
                          return (
                            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2.5 min-w-[220px]">
                              <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
                                Month: {label}
                              </p>
                              <div className="space-y-2">
                                {payload.map((entry: any, index: number) => {
                                  const isSanctioned = entry.dataKey === 'sanctionedAmount' || entry.name === 'Sanctioned Loan';
                                  const numVal = Number(entry.value) || 0;
                                  const colorClass = isSanctioned ? 'text-indigo-600' : 'text-emerald-600';
                                  const dotColor = isSanctioned ? 'bg-indigo-600' : 'bg-emerald-500';
                                  const countText = isSanctioned
                                    ? `${entry.payload.sanctionCount || 0} loan${entry.payload.sanctionCount !== 1 ? 's' : ''}`
                                    : `${entry.payload.repaymentCount || 0} payment${entry.payload.repaymentCount !== 1 ? 's' : ''}`;

                                  return (
                                    <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-xs">
                                      <div className="flex items-center gap-1.5">
                                        <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotColor)} />
                                        <span className={cn("font-bold", colorClass)}>
                                          {isSanctioned ? 'Sanctioned Loan' : 'Repayment Received'}:
                                        </span>
                                      </div>
                                      <div className="text-right">
                                        <span className={cn("font-black block", colorClass)}>
                                          ₹{numVal.toLocaleString('en-IN')}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-normal">
                                          ({countText})
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
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
                      />
                      <Bar 
                        dataKey="repaidAmount" 
                        name="Repayment Received" 
                        fill="url(#repaidBarGradient)" 
                        radius={[8, 8, 0, 0]} 
                        maxBarSize={45}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="py-16 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <HandCoins className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Loan Activity Yet</p>
                  <p className="text-xs text-slate-400 mt-1">Once loans are approved or repayments are recorded, month-wise data will be charted here.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Member-wise Loan Disbursements by Month Chart (Admin Only) */}
        {isAdmin && (
          <div className={cn(
            "bg-white p-6 sm:p-7 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2 relative overflow-hidden transition-all",
            isAndroid && "p-4 overflow-hidden"
          )}>
            <div 
              onClick={() => toggleGraph('member-disbursements')}
              className={cn(
                "flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer group select-none transition-colors",
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
                      Member-wise Loan Disbursements by Month
                    </h3>
                    <span className="text-slate-400 group-hover:text-violet-600 transition-colors">
                      {collapsedGraphs['member-disbursements'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Month-wise breakdown of members who availed loans
                  </p>
                </div>
              </div>

              {/* Month Selector Pills */}
              {availableLoanMonths.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-100/80 rounded-2xl border border-slate-200/80" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setSelectedLoanMonthFilter('all')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-bold rounded-xl transition-all",
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
                          "px-3 py-1.5 text-xs font-bold rounded-xl transition-all",
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

            {!collapsedGraphs['member-disbursements'] && (
              filteredMemberLoansByMonth.length > 0 ? (
                <>
                  <div className={cn("h-[360px] w-full mt-2", isAndroid && "h-[290px]")}>
                    <ResponsiveContainer width="99%" height="100%">
                      <BarChart 
                        data={filteredMemberLoansByMonth} 
                        margin={isAndroid ? { top: 15, right: 10, left: 0, bottom: 65 } : { top: 20, right: 30, left: 20, bottom: 65 }}
                      >
                        <defs>
                          <linearGradient id="memberLoanBarGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                            <stop offset="100%" stopColor="#6d28d9" stopOpacity={0.85} />
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
                            const isPaid = data?.status === 'paid';

                            return (
                              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2.5 min-w-[220px]">
                                <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
                                  Member: {memberName}
                                </p>
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-violet-600" />
                                      <span className="font-bold text-violet-600">
                                        Loan Disbursed:
                                      </span>
                                    </div>
                                    <div className="text-right">
                                      <span className="font-black text-violet-600 block">
                                        ₹{numVal.toLocaleString('en-IN')}
                                      </span>
                                      <span className="text-[10px] text-slate-400 font-normal">
                                        ({monthLabel} • {isPaid ? 'Settled' : 'Active'})
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
                          fill="url(#memberLoanBarGradient)" 
                          radius={[8, 8, 0, 0]} 
                          maxBarSize={50}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <div className="py-16 text-center bg-slate-50/60 rounded-2xl border border-dashed border-slate-200">
                  <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-slate-700">No Member Loan Disbursements</p>
                  <p className="text-xs text-slate-400 mt-1">Once member loans are approved, month-wise member records will be plotted here.</p>
                </div>
              )
            )}
          </div>
        )}

        {/* Personal Contributions for Members */}
        {!isAdmin && (
          <div className={cn(
            "bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2 transition-all",
            isAndroid && "p-4 overflow-hidden"
          )}>
            <div
              onClick={() => toggleGraph('contribution-history')}
              className={cn(
                "flex items-center justify-between cursor-pointer group select-none transition-colors",
                !collapsedGraphs['contribution-history'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Your Contribution History
                </h3>
                <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                  {collapsedGraphs['contribution-history'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </span>
              </div>
            </div>
            {!collapsedGraphs['contribution-history'] && (
              <div className={cn("h-[350px] w-full", isAndroid && "h-[280px]")}>
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={memberContributionsData} margin={isAndroid ? { top: 10, right: 10, left: 0, bottom: 60 } : { top: 20, right: 30, left: 20, bottom: 80 }}>
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
                                  <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-indigo-600" />
                                  <span className="font-bold text-indigo-600">
                                    Contribution:
                                  </span>
                                </div>
                                <span className="font-black text-indigo-600">
                                  ₹{numVal.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Member vs Loan Received vs Paid */}
        {(isAdmin || (memberLoans.length > 0 && memberLoans[0].borrowed > 0)) && (
          <div className={cn("bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2 transition-all", isAndroid && "p-4 overflow-hidden")}>
            <div
              onClick={() => toggleGraph('borrowed-repaid')}
              className={cn(
                "flex items-center justify-between cursor-pointer group select-none transition-colors",
                !collapsedGraphs['borrowed-repaid'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Memberwise Borrowed vs Repaid
                </h3>
                <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                  {collapsedGraphs['borrowed-repaid'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </span>
              </div>
            </div>
            {!collapsedGraphs['borrowed-repaid'] && (
              <div className={cn("h-[400px] w-full", isAndroid && "h-[300px]")}>
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={memberLoans} margin={isAndroid ? { top: 10, right: 10, left: 0, bottom: 60 } : { top: 20, right: 30, left: 20, bottom: 80 }}>
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
                        const limit = isAndroid ? 8 : 12;
                        return val.length > limit ? val.substring(0, limit - 2) + ".." : val;
                      }}
                    />
                    <YAxis tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} width={isAndroid ? 45 : 60} tickFormatter={(val) => Number(val).toLocaleString('en-IN')} />
                    <Tooltip 
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const item = memberLoans.find(d => d.uniqueId === label) || payload[0]?.payload;
                        return (
                          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2.5 min-w-[220px]">
                            <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
                              Member: {item?.name || label}
                            </p>
                            <div className="space-y-2">
                              {payload.map((entry: any, index: number) => {
                                const isBorrowed = entry.dataKey === 'borrowed' || entry.name === 'Borrowed';
                                const numVal = Number(entry.value) || 0;
                                const colorClass = isBorrowed ? 'text-indigo-600' : 'text-emerald-600';
                                const dotColor = isBorrowed ? 'bg-indigo-600' : 'bg-emerald-500';

                                return (
                                  <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotColor)} />
                                      <span className={cn("font-bold", colorClass)}>
                                        {isBorrowed ? 'Borrowed' : 'Repaid'}:
                                      </span>
                                    </div>
                                    <span className={cn("font-black", colorClass)}>
                                      ₹{numVal.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={isAndroid ? { fontSize: '10px' } : undefined} />
                    <Bar dataKey="borrowed" name="Borrowed" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="repaid" name="Repaid" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Group Financial Health (Area Chart) */}
        {isAdmin && (
          <div className={cn("bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2 transition-all", isAndroid && "p-4 overflow-hidden")}>
            <div
              onClick={() => toggleGraph('financial-health')}
              className={cn(
                "flex items-center justify-between cursor-pointer group select-none transition-colors",
                !collapsedGraphs['financial-health'] ? "mb-6" : "mb-0"
              )}
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  Financial Health Overview
                </h3>
                <span className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                  {collapsedGraphs['financial-health'] ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                </span>
              </div>
            </div>
            {!collapsedGraphs['financial-health'] && (
              <div className={cn("h-[350px] w-full", isAndroid && "h-[280px]")}>
                <ResponsiveContainer width="99%" height="100%">
                  <BarChart data={savingsVsLoans} margin={isAndroid ? { top: 10, right: 10, left: 0, bottom: 20 } : { top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" hide />
                    <YAxis tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} width={isAndroid ? 45 : 60} tickFormatter={(val) => Number(val).toLocaleString('en-IN')} />
                    <Tooltip 
                      content={({ active, payload }) => {
                        if (!active || !payload || !payload.length) return null;
                        return (
                          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xl space-y-2.5 min-w-[230px]">
                            <p className="text-xs font-bold text-slate-900 border-b border-slate-100 pb-1.5">
                              Financial Health Overview
                            </p>
                            <div className="space-y-2">
                              {payload.map((entry: any, index: number) => {
                                const key = entry.dataKey || entry.name;
                                const numVal = Number(entry.value) || 0;
                                let labelName = 'Savings';
                                let colorClass = 'text-indigo-600';
                                let dotColor = 'bg-indigo-600';

                                if (key === 'savings' || key === 'Savings') {
                                  labelName = 'Total Savings';
                                  colorClass = 'text-indigo-600';
                                  dotColor = 'bg-indigo-600';
                                } else if (key === 'loans' || key === 'Loans') {
                                  labelName = 'Outstanding Loans';
                                  colorClass = 'text-amber-600';
                                  dotColor = 'bg-amber-500';
                                } else if (key === 'available' || key === 'Available') {
                                  labelName = 'Available Balance';
                                  colorClass = 'text-emerald-600';
                                  dotColor = 'bg-emerald-500';
                                }

                                return (
                                  <div key={`item-${index}`} className="flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", dotColor)} />
                                      <span className={cn("font-bold", colorClass)}>
                                        {labelName}:
                                      </span>
                                    </div>
                                    <span className={cn("font-black", colorClass)}>
                                      ₹{numVal.toLocaleString('en-IN')}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={isAndroid ? { fontSize: '10px' } : undefined} />
                    <Bar dataKey="savings" name="Savings" fill="#6366f1" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="loans" name="Loans" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="available" name="Available" fill="#10b981" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default Graphs;

