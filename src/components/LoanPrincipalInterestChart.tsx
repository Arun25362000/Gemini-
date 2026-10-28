import React, { useMemo, useState } from 'react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid, AreaChart, Area
} from 'recharts';
import { 
  PieChart as ChartIcon, IndianRupee, TrendingUp, CheckCircle2, 
  Filter, Layers, ArrowUpRight, ShieldCheck, Wallet, Sparkles
} from 'lucide-react';
import { Loan, LoanPayment, UserProfile } from '../types';
import { cn } from '../lib/utils';
import { getSafeMemberDisplayName } from '../lib/utils';

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
  const [viewMode, setViewMode] = useState<'all' | 'selected'>(selectedLoanId ? 'selected' : 'all');
  const [chartType, setChartType] = useState<'bar' | 'area'>('bar');

  // Filter approved/active loans
  const activeLoans = useMemo(() => {
    return loans.filter(l => l.status === 'approved' || l.status === 'paid');
  }, [loans]);

  // Current active loan if selected
  const activeLoan = useMemo(() => {
    if (!selectedLoanId) return activeLoans[0] || null;
    return activeLoans.find(l => l.id === selectedLoanId) || activeLoans[0] || null;
  }, [activeLoans, selectedLoanId]);

  // Overall totals
  const overallStats = useMemo(() => {
    const totalSanctioned = activeLoans.reduce((sum, l) => sum + (l.approvedAmount || l.amount || 0), 0);
    const approvedLoanIds = new Set(activeLoans.map(l => l.id));
    const relevantPayments = loanPayments.filter(p => approvedLoanIds.has(p.loanId) && p.status === 'paid');

    const totalPrincipalRepaid = relevantPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalInterestRepaid = relevantPayments.reduce((sum, p) => sum + (p.interest || 0), 0);
    const outstandingPrincipal = Math.max(0, totalSanctioned - totalPrincipalRepaid);
    const totalRecovered = totalPrincipalRepaid + totalInterestRepaid;

    return {
      totalSanctioned,
      totalPrincipalRepaid,
      totalInterestRepaid,
      outstandingPrincipal,
      totalRecovered,
      repaymentPercentage: totalSanctioned > 0 ? Math.min(100, Math.round((totalPrincipalRepaid / totalSanctioned) * 100)) : 0
    };
  }, [activeLoans, loanPayments]);

  // Selected loan stats
  const selectedLoanStats = useMemo(() => {
    if (!activeLoan) return null;
    const sanctioned = activeLoan.approvedAmount || activeLoan.amount || 0;
    const payments = loanPayments.filter(p => p.loanId === activeLoan.id && p.status === 'paid');
    const principalRepaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
    const interestRepaid = payments.reduce((sum, p) => sum + (p.interest || 0), 0);
    const outstanding = Math.max(0, sanctioned - principalRepaid);
    const tenure = activeLoan.installments || 10;
    const installmentsPaid = payments.length;

    // Member display name
    const borrower = allUsers.find(u => 
      (activeLoan.userId && u.uid === activeLoan.userId) || 
      (activeLoan.userEmail && u.email.toLowerCase() === activeLoan.userEmail.toLowerCase())
    );
    const memberName = getSafeMemberDisplayName(borrower || activeLoan.userEmail, borrower?.phoneNumber, borrower?.email);

    return {
      loan: activeLoan,
      memberName,
      sanctioned,
      principalRepaid,
      interestRepaid,
      outstanding,
      tenure,
      installmentsPaid,
      repaymentPercentage: sanctioned > 0 ? Math.min(100, Math.round((principalRepaid / sanctioned) * 100)) : 0,
      payments
    };
  }, [activeLoan, loanPayments, allUsers]);

  // Chart data generation
  const chartData = useMemo(() => {
    if (viewMode === 'selected' && selectedLoanStats) {
      // Month-by-month repayment breakdown for the selected loan
      const sorted = [...selectedLoanStats.payments].sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + b.month));
      if (sorted.length === 0) {
        return [{ name: 'No Payments', Principal: 0, Interest: 0, Total: 0 }];
      }
      const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return sorted.map((p, idx) => ({
        name: `#${idx + 1} (${MONTH_NAMES[p.month]} '${String(p.year).slice(-2)})`,
        Principal: p.amount || 0,
        Interest: p.interest || 0,
        Total: (p.amount || 0) + (p.interest || 0)
      }));
    } else {
      // Comparison across top loans
      return activeLoans.slice(0, 10).map((l, index) => {
        const payments = loanPayments.filter(p => p.loanId === l.id && p.status === 'paid');
        const pRepaid = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const iRepaid = payments.reduce((sum, p) => sum + (p.interest || 0), 0);
        const borrower = allUsers.find(u => 
          (l.userId && u.uid === l.userId) || 
          (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase())
        );
        const name = getSafeMemberDisplayName(borrower || l.userEmail, borrower?.phoneNumber, borrower?.email);
        const shortName = name.split(' ')[0] || `Loan #${index + 1}`;

        return {
          name: shortName,
          loanId: l.id,
          Sanctioned: l.approvedAmount || l.amount || 0,
          Principal: pRepaid,
          Interest: iRepaid
        };
      });
    }
  }, [viewMode, selectedLoanStats, activeLoans, loanPayments, allUsers]);

  if (activeLoans.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 sm:p-6 mb-6">
      {/* Header with Title and Mode Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center text-white shadow-xs">
            <ChartIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
              Principal vs. Interest Recovery Analytics
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                0.5% Monthly
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live repayment breakdown comparing recovered principal and trust interest earnings
            </p>
          </div>
        </div>

        {/* View Switcher Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200/60 text-xs font-medium">
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                viewMode === 'all' 
                  ? "bg-white text-indigo-600 font-semibold shadow-2xs" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              All Active Loans
            </button>
            <button
              type="button"
              onClick={() => setViewMode('selected')}
              className={cn(
                "px-3 py-1.5 rounded-lg transition-all",
                viewMode === 'selected' 
                  ? "bg-white text-indigo-600 font-semibold shadow-2xs" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Loan Deep Dive
            </button>
          </div>

          {viewMode === 'selected' && (
            <select
              value={activeLoan?.id || ''}
              onChange={(e) => {
                if (onSelectLoan) onSelectLoan(e.target.value);
              }}
              className="text-xs bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              {activeLoans.map((l) => {
                const borrower = allUsers.find(u => (l.userId && u.uid === l.userId) || (l.userEmail && u.email.toLowerCase() === l.userEmail.toLowerCase()));
                const name = getSafeMemberDisplayName(borrower || l.userEmail, borrower?.phoneNumber, borrower?.email);
                return (
                  <option key={l.id} value={l.id}>
                    {name} (Rs. {(l.approvedAmount || l.amount || 0).toLocaleString('en-IN')})
                  </option>
                );
              })}
            </select>
          )}

          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200/60 text-xs">
            <button
              type="button"
              onClick={() => setChartType('bar')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg transition-all",
                chartType === 'bar' ? "bg-white text-indigo-600 font-semibold shadow-2xs" : "text-slate-600"
              )}
            >
              Bar
            </button>
            <button
              type="button"
              onClick={() => setChartType('area')}
              className={cn(
                "px-2.5 py-1.5 rounded-lg transition-all",
                chartType === 'area' ? "bg-white text-indigo-600 font-semibold shadow-2xs" : "text-slate-600"
              )}
            >
              Trend
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 my-4">
        <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            {viewMode === 'selected' ? 'Sanctioned Principal' : 'Total Sanctioned'}
          </span>
          <div className="text-base sm:text-lg font-bold text-slate-800 mt-1 flex items-center gap-1">
            <span className="text-xs text-slate-400">Rs.</span>
            {(viewMode === 'selected' ? selectedLoanStats?.sanctioned : overallStats.totalSanctioned)?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5 block">
            {viewMode === 'selected' ? `${selectedLoanStats?.tenure || 10} Months Tenure` : `${activeLoans.length} Loans Sanctioned`}
          </span>
        </div>

        <div className="bg-emerald-50/60 rounded-xl p-3 border border-emerald-100/80">
          <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
            Principal Repaid
          </span>
          <div className="text-base sm:text-lg font-bold text-emerald-800 mt-1 flex items-center gap-1">
            <span className="text-xs text-emerald-600">Rs.</span>
            {(viewMode === 'selected' ? selectedLoanStats?.principalRepaid : overallStats.totalPrincipalRepaid)?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[10px] text-emerald-600 font-medium mt-0.5 block">
            {viewMode === 'selected' ? `${selectedLoanStats?.repaymentPercentage}% Recovered` : `${overallStats.repaymentPercentage}% Total Portfolio Recovered`}
          </span>
        </div>

        <div className="bg-indigo-50/60 rounded-xl p-3 border border-indigo-100/80">
          <span className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider block">
            0.5% Interest Earned
          </span>
          <div className="text-base sm:text-lg font-bold text-indigo-800 mt-1 flex items-center gap-1">
            <span className="text-xs text-indigo-600">Rs.</span>
            {(viewMode === 'selected' ? selectedLoanStats?.interestRepaid : overallStats.totalInterestRepaid)?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[10px] text-indigo-600 font-medium mt-0.5 block">
            Net Surplus to Trust Pool
          </span>
        </div>

        <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-100/80">
          <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
            Outstanding Principal
          </span>
          <div className="text-base sm:text-lg font-bold text-amber-800 mt-1 flex items-center gap-1">
            <span className="text-xs text-amber-600">Rs.</span>
            {(viewMode === 'selected' ? selectedLoanStats?.outstanding : overallStats.outstandingPrincipal)?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[10px] text-amber-600 font-medium mt-0.5 block">
            {viewMode === 'selected' ? `${Math.max(0, (selectedLoanStats?.tenure || 10) - (selectedLoanStats?.installmentsPaid || 0))} Installments Pending` : 'Active Outstandings'}
          </span>
        </div>
      </div>

      {/* Recharts Chart Visualization */}
      <div className="h-64 w-full mt-2">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={chartData as any} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#64748b' }} 
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                tickFormatter={(val) => `Rs.${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px'
                }}
                formatter={(val: any) => [`Rs. ${Number(val).toLocaleString('en-IN')}`, '']}
              />
              <Legend 
                verticalAlign="top" 
                height={36} 
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
              />
              <Bar dataKey="Principal" fill="#059669" radius={[4, 4, 0, 0]} name="Principal Repaid (Rs.)" />
              <Bar dataKey="Interest" fill="#6366f1" radius={[4, 4, 0, 0]} name="0.5% Monthly Interest (Rs.)" />
            </BarChart>
          ) : (
            <AreaChart data={chartData as any} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11, fill: '#64748b' }} 
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 10, fill: '#64748b' }} 
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
                tickFormatter={(val) => `Rs.${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#ffffff',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  border: '1px solid #e2e8f0',
                  fontSize: '12px'
                }}
                formatter={(val: any) => [`Rs. ${Number(val).toLocaleString('en-IN')}`, '']}
              />
              <Legend 
                verticalAlign="top" 
                height={36} 
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
              />
              <Area type="monotone" dataKey="Principal" stroke="#059669" fill="#d1fae5" name="Principal Repaid (Rs.)" />
              <Area type="monotone" dataKey="Interest" stroke="#6366f1" fill="#e0e7ff" name="0.5% Monthly Interest (Rs.)" />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};
