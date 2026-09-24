import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  LabelList
} from 'recharts';
import { 
  BarChart3, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Users, 
  ChevronDown, 
  Calendar, 
  CreditCard,
  IndianRupee,
  TrendingUp,
  Search,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  FileDown,
  FileSpreadsheet,
  FileText
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
    if (!loans || !activeMember) return null;
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

  // Prepare data for Recharts BarChart
  const chartData = useMemo(() => {
    return monthsList.map(m => {
      const match = userContribs.find(c => c.month === m.month && c.year === m.year);
      const amount = match ? match.amount : 0;
      const status = match ? match.status : 'unpaid';
      const paymentMethod = match?.paymentMethod || (match as any)?.paymentMode || '-';

      let paidDateStr = '';
      if (match?.timestamp) {
        try {
          if (typeof match.timestamp.toDate === 'function') {
            const d = match.timestamp.toDate();
            paidDateStr = `${String(d.getDate()).padStart(2, '0')}-${MONTH_NAMES[d.getMonth() + 1]}-${d.getFullYear()}`;
          } else if (match.timestamp instanceof Date) {
            paidDateStr = `${String(match.timestamp.getDate()).padStart(2, '0')}-${MONTH_NAMES[match.timestamp.getMonth() + 1]}-${match.timestamp.getFullYear()}`;
          } else if (typeof match.timestamp === 'string') {
            paidDateStr = match.timestamp.split('T')[0];
          }
        } catch (e) {
          paidDateStr = '';
        }
      }

      return {
        month: m.month,
        year: m.year,
        monthName: m.monthName,
        label: m.label,
        shortLabel: m.shortLabel,
        amount,
        status, // 'paid' | 'pending' | 'unpaid'
        paymentMethod,
        paidDateStr,
        isCurrentMonth: m.month === currentMonth && m.year === currentYear
      };
    });
  }, [monthsList, userContribs, currentMonth, currentYear]);

  // Summary statistics for KPI cards
  const stats = useMemo(() => {
    const paidEntries = chartData.filter(d => d.status === 'paid');
    const pendingEntries = chartData.filter(d => d.status === 'pending');
    const totalPaid = paidEntries.reduce((sum, d) => sum + d.amount, 0);
    const totalMonths = chartData.length;
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
  }, [chartData]);

  // Custom top label for bar
  const renderCustomBarLabel = (props: any) => {
    const { x, y, width, value, index } = props;
    const entry = chartData[index];
    if (!entry || entry.amount <= 0) return null;

    return (
      <text
        x={x + width / 2}
        y={y - 6}
        fill={entry.status === 'paid' ? '#059669' : '#d97706'}
        textAnchor="middle"
        fontSize={10}
        fontWeight="bold"
        className="select-none"
      >
        ₹{value >= 1000 ? `${value / 1000}k` : value}
      </text>
    );
  };

  // Custom rich tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900/95 backdrop-blur-sm text-white px-3.5 py-3 rounded-2xl shadow-xl border border-slate-700/80 text-xs min-w-[170px] select-none z-50">
          <div className="flex items-center justify-between gap-3 mb-2 border-b border-slate-800 pb-1.5">
            <span className="font-bold text-slate-200">{data.label}</span>
            {data.isCurrentMonth && (
              <span className="px-1.5 py-0.5 bg-indigo-500/30 text-indigo-300 text-[10px] font-semibold rounded">
                Current
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Contribution:</span>
              <span className="font-black text-white text-sm">
                ₹{data.amount.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Status:</span>
              <span className={cn(
                "font-bold px-2 py-0.5 rounded-full text-[10px]",
                data.status === 'paid' && "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
                data.status === 'pending' && "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                data.status === 'unpaid' && "bg-slate-800 text-slate-400 border border-slate-700"
              )}>
                {data.status === 'paid' ? 'Paid' : data.status === 'pending' ? 'Pending' : 'Unpaid'}
              </span>
            </div>
            {data.status === 'paid' && (
              <>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400">Payment Mode:</span>
                  <span className="font-medium text-slate-300 capitalize">{data.paymentMethod}</span>
                </div>
                {data.paidDateStr && (
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Recorded Date:</span>
                    <span className="font-medium text-slate-300">{data.paidDateStr}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  if (!activeMember) {
    return (
      <div className="p-6 bg-slate-50 border border-slate-200 rounded-3xl text-center">
        <Users className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <p className="text-sm font-semibold text-slate-600">No member selected</p>
        <p className="text-xs text-slate-400 mt-1">Select a member to view their monthly contribution history.</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-b from-indigo-50/40 via-white to-white rounded-3xl border-2 border-indigo-100/90 shadow-sm p-4 sm:p-6 transition-all relative overflow-visible">
      {/* Top Banner & Member Selector */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-indigo-100/70">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs shrink-0">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                12-Month Contribution History
              </h4>
              <span className="px-2 py-0.5 bg-indigo-100/80 text-indigo-700 text-[10px] font-black uppercase tracking-wider rounded-md">
                Rolling 12M
              </span>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Monthly deposit history for <span className="text-indigo-600 font-bold">{activeMember.displayName || activeMember.email}</span>
            </p>
          </div>
        </div>

        {/* Member Switcher Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Previous / Next buttons */}
          <div className="flex items-center bg-white border border-slate-200/90 rounded-xl shadow-2xs overflow-hidden">
            <button
              type="button"
              onClick={handlePrevMember}
              className="p-2 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors border-r border-slate-200/90 disabled:opacity-40"
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
              className="p-2 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-colors disabled:opacity-40"
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
              className="flex items-center gap-2.5 px-3 py-2 bg-white hover:bg-indigo-50/50 border border-indigo-200 rounded-xl shadow-2xs transition-all text-left text-xs font-semibold text-slate-800"
            >
              <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                {activeMember.displayName ? activeMember.displayName[0].toUpperCase() : '?'}
              </div>
              <div className="min-w-0 max-w-[150px] sm:max-w-[200px]">
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
                              "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left transition-colors",
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
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            title={isCollapsed ? "Expand Chart" : "Collapse Chart"}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform duration-200", isCollapsed && "-rotate-90")} />
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="pt-4 space-y-4">
          {/* KPI Stat Cards */}
          <div className={cn("grid gap-2.5 sm:gap-3", loanStats ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-2 sm:grid-cols-4")}>
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <CreditCard className="w-3 h-3 text-indigo-500" />
                <span>Total Contributed</span>
              </div>
              <p className="text-base sm:text-lg font-black text-slate-900">
                ₹{stats.totalPaid.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">Last 12 rolling months</p>
            </div>

            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>Paid Months</span>
              </div>
              <p className="text-base sm:text-lg font-black text-emerald-600">
                {stats.paidCount} <span className="text-xs text-slate-400 font-bold">/ {stats.totalMonths}</span>
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                {stats.pendingCount > 0 ? `${stats.pendingCount} pending payment` : 'All cleared'}
              </p>
            </div>

            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <TrendingUp className="w-3 h-3 text-indigo-500" />
                <span>Consistency Rate</span>
              </div>
              <p className="text-base sm:text-lg font-black text-indigo-600">
                {stats.complianceRate}%
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">On-time deposit ratio</p>
            </div>

            <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <Calendar className="w-3 h-3 text-indigo-500" />
                <span>Avg. Monthly</span>
              </div>
              <p className="text-base sm:text-lg font-black text-slate-900">
                ₹{stats.avgMonthly.toLocaleString('en-IN')}
              </p>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">When deposit recorded</p>
            </div>

            {loanStats && (
              <div className="bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200/90 shadow-2xs">
                <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                  <IndianRupee className="w-3 h-3 text-indigo-500" />
                  <span>Loan Portfolio</span>
                </div>
                {loanStats.hasLoans ? (
                  <>
                    <p className="text-base sm:text-lg font-black text-slate-900">
                      ₹{loanStats.outstandingPrincipal.toLocaleString('en-IN')}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                      {loanStats.activeLoanCount > 0 ? `${loanStats.activeLoanCount} active loan(s)` : 'All loans settled'}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-base sm:text-lg font-black text-emerald-600">
                      No Loans
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">No active borrowings</p>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Recharts Bar Chart Container */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2 px-1">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <span>Monthly Deposit Trajectory</span>
              </div>
              
              {/* Status Legend */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-2xs" />
                  <span className="text-[11px] text-slate-600 font-medium">Paid</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-2xs" />
                  <span className="text-[11px] text-slate-600 font-medium">Pending</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-200 shadow-2xs" />
                  <span className="text-[11px] text-slate-400 font-medium">Unpaid</span>
                </div>
              </div>
            </div>

            <div className="w-full h-[280px] sm:h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 24, right: 10, left: -10, bottom: 20 }}
                >
                  <defs>
                    <linearGradient id="paidBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={1} />
                      <stop offset="100%" stopColor="#059669" stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="pendingBarGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={1} />
                      <stop offset="100%" stopColor="#d97706" stopOpacity={0.9} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    stroke="#94a3b8"
                    fontSize={10.5}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                    interval={0}
                    dy={6}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={10.5}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => val === 0 ? '₹0' : `₹${val >= 1000 ? `${val / 1000}k` : val}`}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.05)', radius: 6 }} />
                  <Bar
                    dataKey="amount"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={40}
                  >
                    {chartData.map((entry, index) => (
                      <Cell
                        key={`bar-cell-${index}`}
                        fill={
                          entry.status === 'paid'
                            ? 'url(#paidBarGradient)'
                            : entry.status === 'pending'
                              ? 'url(#pendingBarGradient)'
                              : '#e2e8f0'
                        }
                      />
                    ))}
                    <LabelList dataKey="amount" position="top" content={renderCustomBarLabel} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
