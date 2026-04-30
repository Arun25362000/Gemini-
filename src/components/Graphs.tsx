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

const Graphs: React.FC<GraphsProps> = ({ allUsers, contributions, loans, loanPayments, financials, userEmail, isAdmin }) => {
  // Personal savings calculation
  const personalSavings = contributions
    .filter(c => c.userEmail?.toLowerCase() === userEmail.toLowerCase() && c.status === 'paid')
    .reduce((sum, c) => sum + c.amount, 0);

  // 1. Members vs Contributions (Admin) or Personal Monthly Contributions (Member)
  const memberContributionsData = isAdmin ? 
    allUsers
      .filter(u => u.email !== 'unnati.finance2026@gmail.com')
      .map(u => {
        const total = contributions
          .filter(c => c.userEmail?.toLowerCase() === u.email?.toLowerCase() && c.status === 'paid')
          .reduce((sum, c) => sum + c.amount, 0);
        return {
          name: u.displayName || u.email.split('@')[0],
          amount: total
        };
      })
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10) :
    contributions
      .filter(c => c.userEmail?.toLowerCase() === userEmail.toLowerCase() && c.status === 'paid')
      .map(c => ({
        name: `${MONTH_NAMES[c.month]} ${c.year}`,
        amount: c.amount,
        month: c.month,
        year: c.year
      }))
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month));

  // 2. Member vs Loan Received and Paid
  const memberLoans = allUsers
    .filter(u => u.email !== 'unnati.finance2026@gmail.com')
    .map(u => {
      const userLoans = loans.filter(l => l.userEmail?.toLowerCase() === u.email?.toLowerCase() && l.status === 'approved');
      const totalBorrowed = userLoans.reduce((sum, l) => sum + (l.approvedAmount || 0), 0);
      
      const totalRepaid = loanPayments
        .filter(p => {
          const loan = loans.find(l => l.id === p.loanId);
          return loan?.userEmail?.toLowerCase() === u.email?.toLowerCase() && p.status === 'paid';
        })
        .reduce((sum, p) => sum + p.amount, 0);

      return {
        name: u.displayName || u.email.split('@')[0],
        email: u.email,
        borrowed: totalBorrowed,
        repaid: totalRepaid
      };
    })
    .filter(d => isAdmin ? d.borrowed > 0 : d.email.toLowerCase() === userEmail.toLowerCase())
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
    <div className="space-y-8 pb-12">
      {/* Overview Cards */}
      <div className={cn(
        "grid grid-cols-1 sm:grid-cols-2 gap-6",
        isAdmin ? "lg:grid-cols-3" : "lg:grid-cols-4"
      )}>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">
            {isAdmin ? 'Total Group Savings' : 'Your Total Savings'}
          </p>
          <p className="text-2xl font-bold text-slate-900 line-clamp-1">
            ₹{(isAdmin ? financials.totalSavings : personalSavings).toLocaleString()}
          </p>
        </div>
        {!isAdmin && (
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <p className="text-sm font-medium text-slate-500 mb-1">Total Group Savings</p>
            <p className="text-2xl font-bold text-slate-900 line-clamp-1">
              ₹{financials.totalSavings.toLocaleString()}
            </p>
          </div>
        )}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">
            Total Group Loans Issued
          </p>
          <p className="text-2xl font-bold text-indigo-600 line-clamp-1">
            ₹{financials.outstandingPrincipal.toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-sm font-medium text-slate-500 mb-1">Available Funds</p>
          <p className="text-2xl font-bold text-emerald-600 line-clamp-1">
            ₹{financials.availableBalance.toLocaleString()}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Members vs Contributions or Personal Contributions */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">
            {isAdmin ? 'Top 10 Members by Contributions' : 'Your Contribution History'}
          </h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberContributionsData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  interval={0} 
                  height={60}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`₹${value.toLocaleString()}`, isAdmin ? 'Total Contributed' : 'Contribution Amount']}
                />
                <Bar dataKey="amount" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Total Group Savings vs Total Loan Issued (Pie) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Savings vs Loans Distribution</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={groupOverview}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {groupOverview.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => `₹${value.toLocaleString()}`}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Member vs Loan Received vs Paid */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Member Loans: Borrowed vs Repaid</h3>
          <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={memberLoans} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  interval={0} 
                  height={60}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => `₹${value.toLocaleString()}`}
                />
                <Legend />
                <Bar dataKey="borrowed" name="Total Borrowed" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="repaid" name="Total Repaid" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Group Financial Health (Area Chart) */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-bold text-slate-900 mb-6">Group Financial Health Overview</h3>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={savingsVsLoans} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" hide />
                <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => `₹${value.toLocaleString()}`}
                />
                <Legend />
                <Bar dataKey="savings" name="Total Savings" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="loans" name="Outstanding Loans" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                <Bar dataKey="available" name="Available Funds" fill="#10b981" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Graphs;
