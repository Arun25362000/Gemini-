import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, 
  Calendar, 
  CheckCircle2, 
  Banknote, 
  Zap, 
  CreditCard, 
  Wallet, 
  CheckSquare, 
  Square, 
  Sparkles,
  Info,
  Clock,
  ArrowRight
} from 'lucide-react';
import { format } from 'date-fns';
import { UserProfile, Loan, LoanPayment, Contribution } from '../types';
import { cn } from '../lib/utils';

interface AdvancePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  currentUser: { uid?: string; email?: string; displayName?: string } | null;
  allUsers: UserProfile[];
  loans: Loan[];
  loanPayments: LoanPayment[];
  contributions: Contribution[];
  initialUserId?: string;
  initialStream?: 'contribution' | 'loan' | 'both';
  onConfirmContributionAdvance: (params: {
    targetUser: UserProfile;
    amount: number;
    paymentMethod: 'cash' | 'online';
    paymentDate: string;
    coveredMonths: Array<{ month: number; year: number; amount: number }>;
    advanceSpanText: string;
    status: 'paid' | 'pending';
  }) => Promise<void>;
  onConfirmLoanAdvance: (params: {
    targetUser: UserProfile;
    loan: Loan;
    amount: number;
    interest: number;
    paymentMethod: 'cash' | 'online';
    paymentDate: string;
    coveredMonths: Array<{ month: number; year: number; principal: number; interest: number }>;
    advanceSpanText: string;
    status: 'paid' | 'pending';
  }) => Promise<void>;
  onConfirmBothAdvance?: (params: {
    targetUser: UserProfile;
    loan: Loan;
    contribAmount: number;
    contribCoveredMonths: Array<{ month: number; year: number; amount: number }>;
    loanPrincipal: number;
    loanInterest: number;
    loanCoveredMonths: Array<{ month: number; year: number; principal: number; interest: number }>;
    paymentMethod: 'cash' | 'online';
    paymentDate: string;
    advanceSpanText: string;
    status: 'paid' | 'pending';
  }) => Promise<void>;
}

export const AdvancePaymentModal: React.FC<AdvancePaymentModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  currentUser,
  allUsers,
  loans,
  loanPayments,
  contributions,
  initialUserId,
  initialStream = 'contribution',
  onConfirmContributionAdvance,
  onConfirmLoanAdvance,
  onConfirmBothAdvance
}) => {
  // Target Member selection
  const [selectedUserId, setSelectedUserId] = useState<string>(() => {
    if (initialUserId) return initialUserId;
    if (currentUser?.uid) return currentUser.uid;
    if (currentUser?.email) return currentUser.email;
    return '';
  });

  // Payment Stream: 'contribution' | 'loan' | 'both'
  const [paymentStream, setPaymentStream] = useState<'contribution' | 'loan' | 'both'>(initialStream);

  // Payment Mode: 'online' | 'cash'
  const [paymentMode, setPaymentMode] = useState<'online' | 'cash'>('online');

  // Payment Date
  const [paymentDate, setPaymentDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));

  // Selected Months state (format: "YYYY-M")
  const [selectedMonthKeys, setSelectedMonthKeys] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync selected user when modal opens or initialUserId changes
  React.useEffect(() => {
    if (initialUserId) {
      setSelectedUserId(initialUserId);
    } else if (currentUser?.uid) {
      setSelectedUserId(currentUser.uid);
    } else if (currentUser?.email) {
      setSelectedUserId(currentUser.email);
    }
  }, [initialUserId, currentUser]);

  // Find target user profile
  const targetUser = useMemo(() => {
    if (!selectedUserId) return null;
    return allUsers.find(u => 
      u.uid === selectedUserId || 
      (u.id && u.id === selectedUserId) || 
      (u.email && u.email.toLowerCase() === selectedUserId.toLowerCase())
    ) || null;
  }, [allUsers, selectedUserId]);

  // Find target user active loan
  const targetLoan = useMemo(() => {
    if (!targetUser) return null;
    const uid = targetUser.uid || targetUser.id;
    const email = (targetUser.email || '').toLowerCase().trim();
    return loans.find(l => 
      l.status === 'approved' && 
      (l.userId === uid || (l.userEmail && l.userEmail.toLowerCase().trim() === email))
    ) || null;
  }, [loans, targetUser]);

  // If user has no active loan, fallback stream to 'contribution'
  React.useEffect(() => {
    if (!targetLoan && (paymentStream === 'loan' || paymentStream === 'both')) {
      setPaymentStream('contribution');
    }
  }, [targetLoan, paymentStream]);

  // Generate upcoming 18 months starting from current month
  const upcomingMonths = useMemo(() => {
    const list: Array<{ month: number; year: number; key: string; label: string; isPastOrCurrent: boolean }> = [];
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1;

    for (let i = 0; i < 18; i++) {
      const d = new Date(curYear, curMonth - 1 + i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const key = `${y}-${m}`;
      list.push({
        month: m,
        year: y,
        key,
        label: format(d, 'MMM yyyy'),
        isPastOrCurrent: i === 0
      });
    }
    return list;
  }, []);

  // Check if target user has paid contribution for a given month/year
  const isContributionPaid = (month: number, year: number): boolean => {
    if (!targetUser) return false;
    const uid = targetUser.uid || targetUser.id;
    const email = (targetUser.email || '').toLowerCase().trim();

    return contributions.some(c => {
      const match = c.userId === uid || (c.userEmail && c.userEmail.toLowerCase().trim() === email);
      if (!match) return false;
      const isPaid = c.status === 'paid';
      if (!isPaid) return false;
      if (c.month === month && c.year === year) return true;
      if (c.isAdvance && c.coveredMonths?.some(cm => cm.month === month && cm.year === year)) return true;
      return false;
    });
  };

  // Check if target loan installment is paid for a given month/year
  const isLoanInstallmentPaid = (month: number, year: number): boolean => {
    if (!targetLoan) return false;
    return loanPayments.some(p => {
      const matchLoan = p.loanId === targetLoan.id;
      if (!matchLoan) return false;
      const isPaid = p.status === 'paid';
      if (!isPaid) return false;
      if (p.month === month && p.year === year) return true;
      if (p.isAdvance && p.coveredMonths?.some(cm => cm.month === month && cm.year === year)) return true;
      return false;
    });
  };

  // Check if a month is already settled for the current active stream
  const isMonthDisabled = (month: number, year: number): boolean => {
    if (paymentStream === 'contribution') {
      return isContributionPaid(month, year);
    }
    if (paymentStream === 'loan') {
      return isLoanInstallmentPaid(month, year);
    }
    // 'both': disabled only if BOTH are already paid
    return isContributionPaid(month, year) && isLoanInstallmentPaid(month, year);
  };

  // Filter available unpaid months for quick preset selectors
  const unpaidMonths = useMemo(() => {
    return upcomingMonths.filter(m => !isMonthDisabled(m.month, m.year));
  }, [upcomingMonths, paymentStream, targetUser, targetLoan, contributions, loanPayments]);

  // Select quick presets
  const applyPreset = (count: number) => {
    const selected = unpaidMonths.slice(0, count).map(m => m.key);
    setSelectedMonthKeys(selected);
  };

  // Select all unpaid up to 12 months
  const selectAllUnpaid = () => {
    const selected = unpaidMonths.slice(0, 12).map(m => m.key);
    setSelectedMonthKeys(selected);
  };

  // Toggle individual month
  const toggleMonth = (key: string) => {
    setSelectedMonthKeys(prev => 
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  // Sort selected months chronologically
  const sortedSelectedMonths = useMemo(() => {
    return [...selectedMonthKeys]
      .map(k => {
        const [y, m] = k.split('-').map(Number);
        return { year: y, month: m, key: k };
      })
      .sort((a, b) => (a.year * 100 + a.month) - (b.year * 100 + a.month));
  }, [selectedMonthKeys]);

  // Format Span Text (e.g., "Nov 2026 – Apr 2027 · 6 Months")
  const advanceSpanText = useMemo(() => {
    if (sortedSelectedMonths.length === 0) return '';
    const count = sortedSelectedMonths.length;
    const first = sortedSelectedMonths[0];
    const last = sortedSelectedMonths[sortedSelectedMonths.length - 1];
    const firstStr = format(new Date(first.year, first.month - 1), 'MMM yyyy');
    const lastStr = format(new Date(last.year, last.month - 1), 'MMM yyyy');

    if (count === 1) {
      return `${firstStr} · 1 Month`;
    }
    return `${firstStr} – ${lastStr} · ${count} Months`;
  }, [sortedSelectedMonths]);

  // Compute Contribution Advance Breakdown
  const contribBreakdown = useMemo(() => {
    const list = sortedSelectedMonths.map(m => ({
      month: m.month,
      year: m.year,
      amount: 1000
    }));
    const totalAmount = list.length * 1000;
    return { list, totalAmount };
  }, [sortedSelectedMonths]);

  // Compute Loan Advance Breakdown based on reducing balance
  const loanBreakdown = useMemo(() => {
    if (!targetLoan) {
      return { list: [], totalPrincipal: 0, totalInterest: 0, totalAmount: 0 };
    }

    const approvedAmount = targetLoan.approvedAmount || targetLoan.amount || 0;
    // Calculate total principal paid so far on this loan
    const paidPayments = loanPayments.filter(p => p.loanId === targetLoan.id && p.status === 'paid');
    const totalPrincipalPaid = paidPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
    let runningBalance = Math.max(0, approvedAmount - totalPrincipalPaid);

    const standardPrincipal = 5000;
    const list: Array<{ month: number; year: number; principal: number; interest: number }> = [];

    let totalPrincipal = 0;
    let totalInterest = 0;

    for (const m of sortedSelectedMonths) {
      if (runningBalance <= 0) break;
      const principal = Math.min(standardPrincipal, runningBalance);
      const interest = Math.round(runningBalance * 0.005);
      list.push({
        month: m.month,
        year: m.year,
        principal,
        interest
      });
      totalPrincipal += principal;
      totalInterest += interest;
      runningBalance = Math.max(0, runningBalance - principal);
    }

    return {
      list,
      totalPrincipal,
      totalInterest,
      totalAmount: totalPrincipal + totalInterest
    };
  }, [targetLoan, loanPayments, sortedSelectedMonths]);

  // Total payable based on active stream
  const totalPayableAmount = useMemo(() => {
    if (paymentStream === 'contribution') {
      return contribBreakdown.totalAmount;
    }
    if (paymentStream === 'loan') {
      return loanBreakdown.totalAmount;
    }
    return contribBreakdown.totalAmount + loanBreakdown.totalAmount;
  }, [paymentStream, contribBreakdown, loanBreakdown]);

  // Submit Handler
  const handleConfirmAdvancePayment = async () => {
    if (!targetUser) return;
    if (sortedSelectedMonths.length === 0) return;

    setIsSubmitting(true);
    try {
      const status: 'paid' | 'pending' = isAdmin ? 'paid' : 'pending';

      if (paymentStream === 'contribution') {
        await onConfirmContributionAdvance({
          targetUser,
          amount: contribBreakdown.totalAmount,
          paymentMethod: paymentMode,
          paymentDate,
          coveredMonths: contribBreakdown.list,
          advanceSpanText,
          status
        });
      } else if (paymentStream === 'loan' && targetLoan) {
        await onConfirmLoanAdvance({
          targetUser,
          loan: targetLoan,
          amount: loanBreakdown.totalPrincipal,
          interest: loanBreakdown.totalInterest,
          paymentMethod: paymentMode,
          paymentDate,
          coveredMonths: loanBreakdown.list,
          advanceSpanText,
          status
        });
      } else if (paymentStream === 'both' && targetLoan) {
        if (onConfirmBothAdvance) {
          await onConfirmBothAdvance({
            targetUser,
            loan: targetLoan,
            contribAmount: contribBreakdown.totalAmount,
            contribCoveredMonths: contribBreakdown.list,
            loanPrincipal: loanBreakdown.totalPrincipal,
            loanInterest: loanBreakdown.totalInterest,
            loanCoveredMonths: loanBreakdown.list,
            paymentMethod: paymentMode,
            paymentDate,
            advanceSpanText,
            status
          });
        } else {
          // Fallback sequential execution
          await onConfirmContributionAdvance({
            targetUser,
            amount: contribBreakdown.totalAmount,
            paymentMethod: paymentMode,
            paymentDate,
            coveredMonths: contribBreakdown.list,
            advanceSpanText,
            status
          });
          await onConfirmLoanAdvance({
            targetUser,
            loan: targetLoan,
            amount: loanBreakdown.totalPrincipal,
            interest: loanBreakdown.totalInterest,
            paymentMethod: paymentMode,
            paymentDate,
            coveredMonths: loanBreakdown.list,
            advanceSpanText,
            status
          });
        }
      }
      onClose();
    } catch (err) {
      console.error("Error executing advance payment:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      {/* Backdrop */}
      <motion.div 
        key="advance-modal-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
      />

      {/* Modal Dialog */}
      <motion.div 
        key="advance-modal-content"
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col max-h-[92vh] overflow-hidden my-auto z-10"
      >
        {/* Header Bar */}
        <div className="px-5 py-4 bg-gradient-to-r from-indigo-50/90 via-sky-50/40 to-white border-b border-indigo-100/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-indigo-200">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-slate-900 truncate">
                  Multi-Month Advance Payment
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  Consolidated
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">
                Pay 3, 6, 12 months ahead with automatic forward allocation
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 text-slate-800 text-xs sm:text-sm">
          {/* Member Picker (Visible for Admin) */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Select Member
              </label>
              <select
                value={selectedUserId}
                onChange={(e) => {
                  setSelectedUserId(e.target.value);
                  setSelectedMonthKeys([]);
                }}
                className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100/70 focus:bg-white rounded-xl border border-slate-200 text-slate-900 font-medium text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
              >
                {allUsers.filter(u => u.email?.toLowerCase() !== 'unnati.finance2026@gmail.com').map((u, idx) => (
                  <option key={`adv-user-opt-${u.uid || u.email || idx}`} value={u.uid || u.email}>
                    {u.displayName || u.email} {u.phoneNumber ? `(${u.phoneNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Payment Stream Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Payment Stream
            </label>
            <div className={cn("grid gap-2", targetLoan ? "grid-cols-3" : "grid-cols-1")}>
              <button
                type="button"
                onClick={() => setPaymentStream('contribution')}
                className={cn(
                  "p-3 rounded-2xl border-2 font-bold text-left transition-all cursor-pointer flex flex-col justify-between",
                  paymentStream === 'contribution'
                    ? "bg-indigo-50/80 border-indigo-600 text-indigo-950 shadow-xs ring-1 ring-indigo-400"
                    : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <Wallet className={cn("w-4 h-4", paymentStream === 'contribution' ? "text-indigo-600" : "text-slate-400")} />
                  {paymentStream === 'contribution' && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                </div>
                <span className="text-xs font-black block">Monthly Contribution</span>
                <span className="text-[10px] text-slate-500 font-semibold mt-0.5">₹1,000 / month</span>
              </button>

              {targetLoan && (
                <>
                  <button
                    type="button"
                    onClick={() => setPaymentStream('loan')}
                    className={cn(
                      "p-3 rounded-2xl border-2 font-bold text-left transition-all cursor-pointer flex flex-col justify-between",
                      paymentStream === 'loan'
                        ? "bg-purple-50/80 border-purple-600 text-purple-950 shadow-xs ring-1 ring-purple-400"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <CreditCard className={cn("w-4 h-4", paymentStream === 'loan' ? "text-purple-600" : "text-slate-400")} />
                      {paymentStream === 'loan' && <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />}
                    </div>
                    <span className="text-xs font-black block">Loan EMI Advance</span>
                    <span className="text-[10px] text-slate-500 font-semibold mt-0.5">₹5,000 + 0.5% Int</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentStream('both')}
                    className={cn(
                      "p-3 rounded-2xl border-2 font-bold text-left transition-all cursor-pointer flex flex-col justify-between",
                      paymentStream === 'both'
                        ? "bg-emerald-50/80 border-emerald-600 text-emerald-950 shadow-xs ring-1 ring-emerald-400"
                        : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <Zap className={cn("w-4 h-4", paymentStream === 'both' ? "text-emerald-600" : "text-slate-400")} />
                      {paymentStream === 'both' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                    </div>
                    <span className="text-xs font-black block">Both (Combined)</span>
                    <span className="text-[10px] text-slate-500 font-semibold mt-0.5">Contrib + Loan EMI</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Quick Presets Bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Quick Presets
              </label>
              <span className="text-[10.5px] font-semibold text-slate-400">
                1-tap period selection
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyPreset(3)}
                className="py-2 px-2 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all text-center cursor-pointer active:scale-95"
              >
                Next 3 Mos
              </button>
              <button
                type="button"
                onClick={() => applyPreset(6)}
                className="py-2 px-2 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all text-center cursor-pointer active:scale-95"
              >
                Next 6 Mos
              </button>
              <button
                type="button"
                onClick={() => applyPreset(12)}
                className="py-2 px-2 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all text-center cursor-pointer active:scale-95"
              >
                Next 12 Mos
              </button>
              <button
                type="button"
                onClick={selectAllUnpaid}
                className="py-2 px-2 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all text-center cursor-pointer active:scale-95"
              >
                Select Unpaid
              </button>
            </div>
          </div>

          {/* Interactive Checkbox Month Picker */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700">
                Pick Specific Months ({selectedMonthKeys.length} Selected)
              </label>
              {selectedMonthKeys.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedMonthKeys([])}
                  className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1.5 border border-slate-200 rounded-2xl bg-slate-50/50">
              {upcomingMonths.map((m) => {
                const disabled = isMonthDisabled(m.month, m.year);
                const isSelected = selectedMonthKeys.includes(m.key);

                return (
                  <button
                    key={`adv-month-${m.key}`}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleMonth(m.key)}
                    className={cn(
                      "p-2.5 rounded-xl border flex items-center justify-between transition-all text-left cursor-pointer disabled:cursor-not-allowed",
                      disabled 
                        ? "bg-slate-100/70 border-slate-200 text-slate-400 opacity-60" 
                        : isSelected
                        ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                        : "bg-white border-slate-200/90 text-slate-800 hover:border-indigo-300 hover:bg-slate-50"
                    )}
                  >
                    <div className="min-w-0 pr-1">
                      <span className="font-extrabold text-xs block leading-tight truncate">
                        {m.label}
                      </span>
                      <span className={cn(
                        "text-[10px] font-semibold block leading-tight mt-0.5",
                        isSelected ? "text-indigo-100" : "text-slate-400"
                      )}>
                        {disabled ? "Settled" : (
                          paymentStream === 'contribution' ? "₹1,000" :
                          paymentStream === 'loan' ? "₹5,000+EMI" : "Contrib+EMI"
                        )}
                      </span>
                    </div>

                    <div className="shrink-0">
                      {disabled ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                      ) : isSelected ? (
                        <CheckSquare className="w-4 h-4 text-white" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Coverage Summary Box */}
          {selectedMonthKeys.length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/90 via-slate-50 to-white border-2 border-indigo-200/80 shadow-xs space-y-2.5"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 block">
                    Advance Coverage Span
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {advanceSpanText}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                    Total Selected
                  </span>
                  <span className="text-sm font-black text-indigo-600">
                    {selectedMonthKeys.length} Months
                  </span>
                </div>
              </div>

              {/* Breakdown Rows */}
              <div className="pt-2 border-t border-indigo-100/90 space-y-1.5 text-xs">
                {paymentStream !== 'loan' && (
                  <div className="flex justify-between items-center text-slate-700">
                    <span>Monthly Contributions ({selectedMonthKeys.length} × ₹1,000):</span>
                    <span className="font-mono font-bold tabular-nums">
                      ₹{contribBreakdown.totalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                )}

                {paymentStream !== 'contribution' && (
                  <>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>Loan Principal Recovery ({loanBreakdown.list.length} Months):</span>
                      <span className="font-mono font-bold tabular-nums">
                        ₹{loanBreakdown.totalPrincipal.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-700">
                      <span>Estimated Loan Interest (0.5% Reducing):</span>
                      <span className="font-mono font-bold text-emerald-700 tabular-nums">
                        +₹{loanBreakdown.totalInterest.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </>
                )}

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-black text-slate-900">
                  <span>Grand Total Payable:</span>
                  <span className="text-lg font-black text-indigo-600 font-mono tabular-nums">
                    ₹{totalPayableAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* Mode & Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Date
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full py-2.5 px-3 bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 font-medium text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Payment Mode
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode('online')}
                  className={cn(
                    "py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                    paymentMode === 'online'
                      ? "bg-indigo-50 border-indigo-600 text-indigo-600 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Online / UPI</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode('cash')}
                  className={cn(
                    "py-2.5 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer",
                    paymentMode === 'cash'
                      ? "bg-amber-50 border-amber-600 text-amber-700 shadow-xs"
                      : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                  )}
                >
                  <Banknote className="w-3.5 h-3.5" />
                  <span>Cash</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmAdvancePayment}
            disabled={isSubmitting || selectedMonthKeys.length === 0}
            className="flex-[2] py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-200/50 flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            {isSubmitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Recording Advance...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 text-white" />
                <span>
                  Confirm Advance (₹{totalPayableAmount.toLocaleString('en-IN')})
                </span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};
