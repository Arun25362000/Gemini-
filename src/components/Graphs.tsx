import React from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';

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

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

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
  React.useEffect(() => {
    const handleResize = () => {
      setIsMobileScreen(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isAndroid = isMobileApp || isMobileScreen;

  // Personal savings calculation (2026 onwards)
  const personalSavings = contributions
    .filter(c => c.userEmail?.toLowerCase() === userEmail.toLowerCase() && c.year >= 2026)
    .reduce((sum, c) => sum + c.amount, 0);

  // 1. Members vs Contributions (Admin) or Personal Monthly Contributions (Member)
  const memberContributionsData = isAdmin ? 
    allUsers
      .filter(u => u.email?.toLowerCase() !== 'unnati.finance2026@gmail.com')
      .map((u, uidx) => {
        const total = contributions
          .filter(c => c.userEmail?.toLowerCase() === u.email?.toLowerCase() && c.year >= 2026)
          .reduce((sum, c) => sum + c.amount, 0);
        
        // Use display name or generic member label
        const baseName = u.displayName || `Member ${uidx + 1}`;
        // uniqueId ensures Recharts treats columns as distinct even if Names match
        const uniqueId = `${u.uid || u.email || 'user'}-${uidx}`;
        
        return {
          name: baseName, // This will be the label
          uniqueId: uniqueId,
          amount: total
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10) :
    Object.values(
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

  // 2. Member vs Loan Received and Paid
  const memberLoans = allUsers
    .filter(u => u.email?.toLowerCase() !== 'unnati.finance2026@gmail.com')
    .map((u, uidx) => {
      const userLoans = loans.filter(l => l.userEmail?.toLowerCase() === u.email?.toLowerCase() && (l.status === 'approved' || l.status === 'paid'));
      const totalBorrowed = userLoans.reduce((sum, l) => sum + (l.approvedAmount || 0), 0);
      
      const totalRepaid = loanPayments
        .filter(p => {
          const loan = loans.find(l => l.id === p.loanId);
          return loan?.userEmail?.toLowerCase() === u.email?.toLowerCase();
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

  // 3. Total Group Savings vs Total Loan Issued
  const groupOverview = [
    { name: 'Total Group Savings', value: financials.totalSavings },
    { name: 'Outstanding Principal', value: financials.outstandingPrincipal },
  ];

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
      {/* Overview Cards */}
      {isAdmin && (
        <div className={cn(
          "grid grid-cols-1 sm:grid-cols-2 gap-6 lg:grid-cols-3",
          isAndroid && "gap-3"
        )}>
          <div className={cn("bg-white p-6 rounded-3xl border border-slate-200 shadow-sm", isAndroid && "p-4")}>
            <p className="text-sm font-medium text-slate-500 mb-1">
              Total Group Savings
            </p>
            <p className="text-2xl font-bold text-slate-900 line-clamp-1">
              ₹{financials.totalSavings.toLocaleString()}
            </p>
          </div>
          <div className={cn("bg-white p-6 rounded-3xl border border-slate-200 shadow-sm", isAndroid && "p-4")}>
            <p className="text-sm font-medium text-slate-500 mb-1">
              Total Group Loans Issued
            </p>
            <p className="text-2xl font-bold text-indigo-600 line-clamp-1">
              ₹{financials.outstandingPrincipal.toLocaleString()}
            </p>
          </div>
          <div className={cn("bg-white p-6 rounded-3xl border border-slate-200 shadow-sm", isAndroid && "p-4")}>
            <p className="text-sm font-medium text-slate-500 mb-1">Available Funds</p>
            <p className="text-2xl font-bold text-emerald-600 line-clamp-1">
              ₹{financials.availableBalance.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-8", isAndroid && "gap-4")}>
        {/* Members vs Contributions or Personal Contributions */}
        <div className={cn(
          "bg-white p-6 rounded-3xl border border-slate-200 shadow-sm",
          !isAdmin && "lg:col-span-2",
          isAndroid && "p-4 overflow-hidden"
        )}>
          <h3 className="text-lg font-bold text-slate-900 mb-6">
            {isAdmin ? 'Top 10 Members' : 'Your Contribution History'}
          </h3>
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
                <YAxis tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} width={isAndroid ? 45 : 60} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  labelFormatter={(id) => memberContributionsData.find(d => d.uniqueId === id)?.name || 'Unknown'}
                  formatter={(value: any) => [`₹${value.toLocaleString()}`, isAdmin ? 'Total' : 'Amount']}
                />
                <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Total Group Savings vs Total Loan Issued (Pie) */}
        {isAdmin && (
          <div className={cn("bg-white p-6 rounded-3xl border border-slate-200 shadow-sm", isAndroid && "p-4 overflow-hidden")}>
            <h3 className="text-lg font-bold text-slate-900 mb-6">Savings vs Loans Distribution</h3>
            <div className={cn("h-[350px] w-full", isAndroid && "h-[300px]")}>
              <ResponsiveContainer width="99%" height="100%">
                <PieChart>
                  <Pie
                    data={groupOverview}
                    cx="50%"
                    cy="45%"
                    innerRadius={isAndroid ? 60 : 80}
                    outerRadius={isAndroid ? 90 : 120}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {groupOverview.map((entry, index) => (
                      <Cell key={`cell-overview-${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => `₹${value.toLocaleString()}`}
                  />
                  <Legend verticalAlign="bottom" height={36} wrapperStyle={isAndroid ? { fontSize: '10px' } : undefined}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Member vs Loan Received vs Paid */}
        {(isAdmin || (memberLoans.length > 0 && memberLoans[0].borrowed > 0)) && (
          <div className={cn("bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2", isAndroid && "p-4 overflow-hidden")}>
            <h3 className="text-lg font-bold text-slate-900 mb-6">Borrowed vs Repaid</h3>
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
                  <YAxis tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} width={isAndroid ? 45 : 60} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    labelFormatter={(id) => memberLoans.find(d => d.uniqueId === id)?.name || 'Unknown'}
                    formatter={(value: any) => `₹${value.toLocaleString()}`}
                  />
                  <Legend wrapperStyle={isAndroid ? { fontSize: '10px' } : undefined} />
                  <Bar dataKey="borrowed" name="Borrowed" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="repaid" name="Repaid" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Group Financial Health (Area Chart) */}
        {isAdmin && (
          <div className={cn("bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2", isAndroid && "p-4 overflow-hidden")}>
            <h3 className="text-lg font-bold text-slate-900 mb-6">Financial Health Overview</h3>
            <div className={cn("h-[350px] w-full", isAndroid && "h-[280px]")}>
              <ResponsiveContainer width="99%" height="100%">
                <BarChart data={savingsVsLoans} margin={isAndroid ? { top: 10, right: 10, left: 0, bottom: 20 } : { top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" hide />
                  <YAxis tick={{ fontSize: isAndroid ? 10 : 12, fill: '#64748b' }} width={isAndroid ? 45 : 60} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => `₹${value.toLocaleString()}`}
                  />
                  <Legend wrapperStyle={isAndroid ? { fontSize: '10px' } : undefined} />
                  <Bar dataKey="savings" name="Savings" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="loans" name="Loans" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="available" name="Available" fill="#10b981" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Graphs;
