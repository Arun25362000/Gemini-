import React, { useMemo, useState } from 'react';
import { 
  BarChart3, 
  CheckCircle2, 
  Users, 
  ChevronDown, 
  Calendar, 
  CreditCard,
  IndianRupee,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
  FileDown,
  FileSpreadsheet,
  FileText,
  AlertCircle
} from 'lucide-react';
import { UserProfile, Contribution, Loan, LoanPayment } from '../types';
import { cn } from '../lib/utils';

interface MemberContributionChartProps {
  selectedMember: UserProfile | null;
  members: UserProfile[];
  contributions: Contribution[];
  loans?: Loan[];
  loanPayments?: LoanPayment[];
  onSelectMember: (member: UserProfile) => void;
  onExportPDF?: (member: UserProfile) => void;
  onExportExcel?: (member: UserProfile) => void;
  currentMonth: number;
  currentYear: number;
}

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const MemberContributionChart: React.FC<MemberContributionChartProps> = ({
  selectedMember,
  members,
  contributions,
  loans,
  loanPayments,
  onSelectMember,
  onExportPDF,
  onExportExcel,
  currentMonth,
  currentYear
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // If no member explicitly selected yet, default to the first member
  const activeMember = useMemo(() => {
    if (selectedMember) return selectedMember;
    return members.length > 0 ? members[0] : null;
  }, [selectedMember, members]);

  // Loan statistics for the currently selected member
  const loanStats = useMemo(() => {
    if (!loans || !activeMember) {
      return {
        totalSanctioned: 0,
        totalPrincipalRepaid: 0,
        totalInterestPaid: 0,
        outstandingPrincipal: 0,
        activeLoanCount: 0,
        hasLoans: false
      };
    }
    const userLoans = loans.filter(l => 
      (activeMember.uid && l.userId && l.userId === activeMember.uid) ||
      (activeMember.email && l.userEmail && l.userEmail.toLowerCase().trim() === activeMember.email.toLowerCase().trim())
    );
    const userPayments = (loanPayments || []).filter(p => {
      const parentLoan = loans.find(l => l.id === p.loanId);
      if (parentLoan) {
        const matchLoanUid = activeMember.uid && parentLoan.userId && parentLoan.userId === activeMember.uid;
        const matchLoanEmail = activeMember.email && parentLoan.userEmail && parentLoan.userEmail.toLowerCase().trim() === activeMember.email.toLowerCase().trim();
        if (matchLoanUid || matchLoanEmail) return true;
      }
      const matchDirectUid = activeMember.uid && p.userId && p.userId === activeMember.uid;
      const matchDirectEmail = activeMember.email && p.userEmail && p.userEmail.toLowerCase().trim() === activeMember.email.toLowerCase().trim();
      return matchDirectUid || matchDirectEmail;
    });
    const sanctionedLoans = userLoans.filter(l => l.status === 'approved' || l.status === 'paid');
    const totalSanctioned = sanctionedLoans.reduce((acc, l) => acc + (l.approvedAmount || l.amount || 0), 0);
    const paidPayments = userPayments.filter(p => p.status === 'paid');
    const totalPrincipalRepaid = paidPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    const totalInterestPaid = paidPayments.reduce((acc, p) => acc + (p.interest || 0), 0);
    const outstandingPrincipal = Math.max(0, totalSanctioned - totalPrincipalRepaid);
    const activeLoanCount = sanctionedLoans.filter(l => l.status === 'approved').length;
    return {
      totalSanctioned,
      totalPrincipalRepaid,
      totalInterestPaid,
      outstandingPrincipal,
      activeLoanCount,
      hasLoans: sanctionedLoans.length > 0
    };
  }, [loans, loanPayments, activeMember]);

  // Filtered members for dropdown search
  const filteredMembers = useMemo(() => {
    if (!searchFilter.trim()) return members;
    const q = searchFilter.toLowerCase().trim();
    return members.filter(m => 
      (m.displayName || '').toLowerCase().includes(q) || 
      m.email.toLowerCase().includes(q) ||
      (m.phoneNumber || '').includes(q)
    );
  }, [members, searchFilter]);

  // Current active index in members array for prev/next buttons
  const activeIndex = useMemo(() => {
    if (!activeMember) return -1;
    return members.findIndex(m => 
      (activeMember.uid && m.uid === activeMember.uid) || 
      (activeMember.email && m.email.toLowerCase() === activeMember.email.toLowerCase())
    );
  }, [members, activeMember]);

  const handlePrevMember = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (members.length === 0) return;
    const prevIdx = activeIndex <= 0 ? members.length - 1 : activeIndex - 1;
    onSelectMember(members[prevIdx]);
  };

  const handleNextMember = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (members.length === 0) return;
    const nextIdx = activeIndex >= members.length - 1 ? 0 : activeIndex + 1;
    onSelectMember(members[nextIdx]);
  };

  // Generate continuous last 12 rolling months ending at currentMonth / currentYear
  const monthsList = useMemo(() => {
    const list: {
      month: number;
      year: number;
      monthName: string;
      label: string;
      shortLabel: string;
    }[] = [];

    for (let i = 11; i >= 0; i--) {
      let m = currentMonth - i;
      let y = currentYear;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      list.push({
        month: m,
        year: y,
        monthName: MONTH_NAMES[m],
        label: `${MONTH_NAMES[m]} ${y}`,
        shortLabel: `${MONTH_NAMES[m]} '${String(y).slice(-2)}`
      });
    }
    return list;
  }, [currentMonth, currentYear]);

  // Gather contributions for active member
  const userContribs = useMemo(() => {
    if (!activeMember) return [];
    return contributions.filter(c => 
      ((activeMember.uid && c.userId === activeMember.uid) || 
       (activeMember.email && c.userEmail?.toLowerCase().trim() === activeMember.email.toLowerCase().trim()))
    );
  }, [activeMember, contributions]);

  // Monthly summary data for stats
  const monthlyData = useMemo(() => {
    return monthsList.map(m => {
      const match = userContribs.find(c => c.month === m.month && c.year === m.year);
      const amount = match ? match.amount : 0;
      const status = match ? match.status : 'unpaid';
      const paymentMethod = match?.paymentMethod || (match as any)?.paymentMode || '-';

      return {
        month: m.month,
        year: m.year,
        monthName: m.monthName,
        label: m.label,
        shortLabel: m.shortLabel,
        amount,
        status, // 'paid' | 'pending' | 'unpaid'
        paymentMethod
      };
    });
  }, [monthsList, userContribs]);

  // Summary statistics for 5 KPI cards
  const stats = useMemo(() => {
    const paidEntries = monthlyData.filter(d => d.status === 'paid');
    const pendingEntries = monthlyData.filter(d => d.status === 'pending');
    const totalPaid = paidEntries.reduce((sum, d) => sum + d.amount, 0);
    const totalMonths = monthlyData.length;
    const paidCount = paidEntries.length;
    const pendingCount = pendingEntries.length;
    const complianceRate = totalMonths > 0 ? Math.round((paidCount / totalMonths) * 100) : 0;
    const avgMonthly = paidCount > 0 ? Math.round(totalPaid / paidCount) : 0;

    return {
      totalPaid,
      paidCount,
      pendingCount,
      totalMonths,
      complianceRate,
      avgMonthly
    };
  }, [monthlyData]);

  if (!activeMember) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl text-center">
        <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-600">No member selected</p>
        <p className="text-xs text-slate-400 mt-1">Select a member to view their monthly contribution history.</p>
      </div>
    );
  }

  const hasActiveBorrowings = loanStats.activeLoanCount > 0;

  return (
    <div className="bg-gradient-to-b from-indigo-50/40 via-white to-white rounded-3xl border-2 border-indigo-100/90 shadow-sm p-4 sm:p-5 transition-all relative overflow-visible">
      {/* Clean Member Controls & Export Toolbar (Ribbon removed) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-indigo-100/70">
        {/* Left: Member Switcher & Searchable Dropdown */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Previous / Next buttons */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={handlePrevMember}
              className="p-2 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors border-r border-slate-200/90 disabled:opacity-40 cursor-pointer"
              title="Previous Member"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2.5 text-[11px] font-bold text-slate-600 select-none">
              {activeIndex + 1} / {members.length}
            </span>
            <button
              type="button"
              onClick={handleNextMember}
              className="p-2 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-40 cursor-pointer"
              title="Next Member"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Interactive Member Selector Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-2 bg-white hover:bg-indigo-50/50 border border-indigo-200 rounded-xl shadow-2xs transition-all text-left text-xs font-semibold text-slate-800 cursor-pointer"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                {activeMember.displayName ? activeMember.displayName[0].toUpperCase() : '?'}
              </div>
              <div className="min-w-0 max-w-[150px] sm:max-w-[220px]">
                <p className="truncate font-bold text-slate-900 leading-tight">
                  {activeMember.displayName || 'Unnamed'}
                </p>
                <p className="truncate text-[10px] text-slate-400 font-medium">
                  {activeMember.email}
                </p>
              </div>
              <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200", isDropdownOpen && "rotate-180")} />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setIsDropdownOpen(false)} 
                />
                <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl z-50 p-2 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                  <div className="p-2 border-b border-slate-100">
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="Search member..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-indigo-500"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-60 overflow-y-auto divide-y divide-slate-50 py-1">
                    {filteredMembers.length === 0 ? (
                      <p className="text-center py-4 text-xs text-slate-400">No member matches search</p>
                    ) : (
                      filteredMembers.map((m) => {
                        const isSelected = 
                          (activeMember.uid && m.uid === activeMember.uid) || 
                          (activeMember.email && m.email.toLowerCase() === activeMember.email.toLowerCase());
                        
                        return (
                          <button
                            key={`dropdown-member-${m.id || m.uid || m.email}`}
                            type="button"
                            onClick={() => {
                              onSelectMember(m);
                              setIsDropdownOpen(false);
                              setSearchFilter('');
                            }}
                            className={cn(
                              "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors cursor-pointer",
                              isSelected ? "bg-indigo-50 text-indigo-900 font-bold" : "hover:bg-slate-50 text-slate-700"
                            )}
                          >
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                              isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
                            )}>
                              {m.displayName ? m.displayName[0].toUpperCase() : '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs leading-tight">{m.displayName || 'Unnamed'}</p>
                              <p className="truncate text-[10px] text-slate-400 font-normal">{m.email}</p>
                            </div>
                            {isSelected && (
                              <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Export History Action for Currently Selected Member */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer select-none"
              title={`Export contribution and loan history for ${activeMember.displayName || activeMember.email}`}
            >
              <FileDown className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export History</span>
              <span className="sm:hidden">Export</span>
              <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", showExportMenu && "rotate-180")} />
            </button>
            {showExportMenu && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowExportMenu(false)} 
                />
                <div className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white border border-slate-200/90 rounded-2xl shadow-xl z-50 p-1.5 overflow-hidden divide-y divide-slate-100 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-3 py-2 bg-slate-50/70 rounded-xl mb-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Export Statement For</p>
                    <p className="text-xs font-bold text-slate-800 truncate">{activeMember.displayName || activeMember.email}</p>
                  </div>
                  <div className="py-1 space-y-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        onExportPDF?.(activeMember);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors text-left rounded-xl group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">Export as PDF</span>
                        <span className="text-[10px] text-slate-400 font-normal">Contributions, loans & repayments</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowExportMenu(false);
                        onExportExcel?.(activeMember);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-slate-700 hover:bg-emerald-50 hover:text-emerald-600 transition-colors text-left rounded-xl group cursor-pointer"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">Export as Excel (.xlsx)</span>
                        <span className="text-[10px] text-slate-400 font-normal">Multi-sheet ledger with all history</span>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Collapse/Expand chart toggle */}
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            title={isCollapsed ? "Expand History" : "Collapse History"}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isCollapsed && "-rotate-90")} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="pt-4 space-y-4">
          {/* 5 KPI Stat Cards Designed to match Loan Overview style */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-3.5">
            {/* Card 1: Total Contributed (Indigo Theme) */}
            <div className="bg-gradient-to-br from-indigo-50/90 via-indigo-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-indigo-200/90 hover:border-indigo-400 hover:shadow-md hover:shadow-indigo-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-indigo-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-indigo-700 bg-indigo-100/90 border border-indigo-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Rolling 12M
                  </span>
                </div>
                <h4 className="text-indigo-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Total Contributed</h4>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-indigo-950 tracking-tight truncate">
                  ₹{stats.totalPaid.toLocaleString('en-IN')}
                </div>
                <div className="w-full bg-indigo-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, stats.complianceRate)}%` }}
                  />
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-indigo-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Period:</span>
                <span className="font-bold text-indigo-700">12 Rolling Months</span>
              </div>
            </div>

            {/* Card 2: Paid Months (Emerald Theme) */}
            <div className="bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-emerald-200/90 hover:border-emerald-400 hover:shadow-md hover:shadow-emerald-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-emerald-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/90 border border-emerald-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {stats.paidCount} / {stats.totalMonths} Paid
                  </span>
                </div>
                <h4 className="text-emerald-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Paid Months</h4>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-emerald-700 tracking-tight truncate flex items-baseline gap-1">
                  <span>{stats.paidCount}</span>
                  <span className="text-xs text-slate-400 font-bold">/ {stats.totalMonths} Mo</span>
                </div>
                <div className="w-full bg-emerald-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${(stats.paidCount / (stats.totalMonths || 1)) * 100}%` }}
                  />
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-emerald-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Status:</span>
                <span className="font-bold text-emerald-700 truncate max-w-[130px]">
                  {stats.pendingCount > 0 ? `${stats.pendingCount} Pending` : 'All Cleared'}
                </span>
              </div>
            </div>

            {/* Card 3: Consistency Rate (Purple Theme) */}
            <div className="bg-gradient-to-br from-purple-50/90 via-purple-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-purple-200/90 hover:border-purple-400 hover:shadow-md hover:shadow-purple-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-purple-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-purple-700 bg-purple-100/90 border border-purple-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    {stats.complianceRate >= 100 ? 'Perfect' : stats.complianceRate >= 75 ? 'Good' : 'Attention'}
                  </span>
                </div>
                <h4 className="text-purple-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Consistency Rate</h4>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-purple-950 tracking-tight truncate">
                  {stats.complianceRate}%
                </div>
                <div className="w-full bg-purple-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-purple-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${stats.complianceRate}%` }}
                  />
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-purple-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Compliance:</span>
                <span className="font-bold text-purple-700">On-time Deposits</span>
              </div>
            </div>

            {/* Card 4: Avg. Monthly (Amber Theme) */}
            <div className="bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-white p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 border-amber-200/90 hover:border-amber-400 hover:shadow-md hover:shadow-amber-100/50 transition-all flex flex-col justify-between group relative overflow-hidden">
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className="w-7.5 h-7.5 rounded-xl bg-amber-600 text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-bold text-amber-800 bg-amber-100/90 border border-amber-200 px-2 py-0.5 rounded-md uppercase tracking-wider">
                    Per Deposit
                  </span>
                </div>
                <h4 className="text-amber-950 text-[10.5px] font-bold uppercase tracking-wider line-clamp-1">Avg. Monthly</h4>
                <div className="mt-0.5 text-xl sm:text-2xl font-black text-amber-700 tracking-tight truncate">
                  ₹{stats.avgMonthly.toLocaleString('en-IN')}
                </div>
                <div className="w-full bg-amber-200/60 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div 
                    className="bg-amber-600 h-full rounded-full transition-all duration-300"
                    style={{ width: stats.paidCount > 0 ? '100%' : '0%' }}
                  />
                </div>
              </div>
              <div className="mt-2.5 pt-2 border-t border-amber-100/90 flex items-center justify-between text-[10.5px]">
                <span className="font-semibold text-slate-500">Recorded:</span>
                <span className="font-bold text-amber-700">Mean Contribution</span>
              </div>
            </div>

            {/* Card 5: Loan Portfolio (Rose / Cyan Theme based on borrowings) */}
            <div className={cn(
              "p-3.5 sm:p-4 rounded-2xl shadow-xs border-2 transition-all flex flex-col justify-between group relative overflow-hidden",
              hasActiveBorrowings
                ? "bg-gradient-to-br from-rose-50/90 via-rose-50/40 to-white border-rose-200/90 hover:border-rose-400 hover:shadow-md hover:shadow-rose-100/50"
                : "bg-gradient-to-br from-cyan-50/90 via-cyan-50/40 to-white border-cyan-200/90 hover:border-cyan-400 hover:shadow-md hover:shadow-cyan-100/50"
            )}>
              <div>
                <div className="flex items-center justify-between gap-1.5 mb-2.5">
                  <div className={cn(
                    "w-7.5 h-7.5 rounded-xl text-white shadow-xs flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform",
                    hasActiveBorrowings ? "bg-rose-600" : "bg-cyan-600"
                  )}>
                    {hasActiveBorrowings ? <AlertCircle className="w-4 h-4" /> : <IndianRupee className="w-4 h-4" />}
                  </div>
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border",
                    hasActiveBorrowings
                      ? "text-rose-700 bg-rose-100/90 border-rose-200"
                      : "text-cyan-700 bg-cyan-100/90 border-cyan-200"
                  )}>
                    {hasActiveBorrowings 
                      ? `${loanStats.activeLoanCount} Active` 
                      : loanStats.hasLoans ? 'Settled' : 'No Loans'}
                  </span>
                </div>
                <h4 className={cn(
                  "text-[10.5px] font-bold uppercase tracking-wider line-clamp-1",
                  hasActiveBorrowings ? "text-rose-950" : "text-cyan-950"
                )}>
                  Loan Portfolio
                </h4>
                <div className={cn(
                  "mt-0.5 text-xl sm:text-2xl font-black tracking-tight truncate",
                  hasActiveBorrowings ? "text-rose-700" : "text-cyan-900"
                )}>
                  {hasActiveBorrowings
                    ? `₹${loanStats.outstandingPrincipal.toLocaleString('en-IN')}`
                    : loanStats.hasLoans 
                      ? 'Settled (₹0)' 
                      : 'No Loans'}
                </div>
                <div className={cn(
                  "w-full h-1.5 rounded-full mt-2 overflow-hidden",
                  hasActiveBorrowings ? "bg-rose-200/60" : "bg-cyan-200/60"
                )}>
                  <div 
                    className={cn("h-full rounded-full transition-all duration-300", hasActiveBorrowings ? "bg-rose-600" : "bg-cyan-600")}
                    style={{ 
                      width: hasActiveBorrowings && loanStats.totalSanctioned > 0
                        ? `${Math.min(100, Math.round((loanStats.totalPrincipalRepaid / loanStats.totalSanctioned) * 100))}%`
                        : '100%' 
                    }}
                  />
                </div>
              </div>
              <div className={cn(
                "mt-2.5 pt-2 border-t flex items-center justify-between text-[10.5px]",
                hasActiveBorrowings ? "border-rose-100/90" : "border-cyan-100/90"
              )}>
                <span className="font-semibold text-slate-500">
                  {hasActiveBorrowings ? 'Balance:' : 'Borrowings:'}
                </span>
                <span className={cn(
                  "font-bold truncate max-w-[130px]",
                  hasActiveBorrowings ? "text-rose-700" : "text-cyan-700"
                )}>
                  {hasActiveBorrowings 
                    ? 'Principal Due' 
                    : loanStats.hasLoans ? 'Fully Cleared' : 'None Active'}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
