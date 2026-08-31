import React from 'react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { UserProfile } from '../types';
import { cn, getAppAvailableYears } from '../lib/utils';
import { Zap, Banknote, Clock, CheckCircle2 } from 'lucide-react';

interface AddContributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  selectedUserId: string | null;
  setSelectedUserId: (id: string | null) => void;
  allUsers: UserProfile[];
  SYSTEM_ADMIN_EMAIL: string;
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  paymentDate: string;
  setPaymentDate: (d: string) => void;
  paymentMethod: 'cash' | 'online';
  setPaymentMethod: (m: 'cash' | 'online') => void;
  MONTHLY_AMOUNT: number;
  isLatePaymentDate: boolean;
  isSubmitting: boolean;
  handleSubmit: (e: React.FormEvent) => void;
}

export const AddContributionModal: React.FC<AddContributionModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  selectedUserId,
  setSelectedUserId,
  allUsers,
  SYSTEM_ADMIN_EMAIL,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  paymentDate,
  setPaymentDate,
  paymentMethod,
  setPaymentMethod,
  MONTHLY_AMOUNT,
  isLatePaymentDate,
  isSubmitting,
  handleSubmit
}) => {
  if (!isOpen) return null;

  const totalAmount = MONTHLY_AMOUNT + (isLatePaymentDate ? 100 : 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        key="modal-add-contrib-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div 
        key="modal-add-contrib-content"
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
      >
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Record Contribution</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          {isAdmin && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Select Member</label>
              <select 
                value={selectedUserId || ''}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">Select a member...</option>
                {allUsers.filter(u => u.email?.toLowerCase() !== SYSTEM_ADMIN_EMAIL.toLowerCase()).map((u, uidx) => (
                  <option key={`contrib-reg-opt-${u.email?.toLowerCase() || 'email'}-${uidx}`} value={u.uid || u.email}>
                    {u.displayName || u.email}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Month</label>
              <select 
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={`contrib-reg-month-${i + 1}`} value={i + 1}>
                    {format(new Date(2024, i, 1), 'MMMM')}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Year</label>
              <select 
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {getAppAvailableYears().map(y => (
                  <option key={`contrib-reg-year-${y}`} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Payment Date</label>
              <input 
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Payment Method</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('online')}
                  className={cn(
                    "py-4 rounded-2xl font-bold transition-all text-sm flex items-center justify-center gap-2 border-2",
                    paymentMethod === 'online'
                      ? "bg-indigo-50 border-indigo-600 text-indigo-600 shadow-lg shadow-indigo-100/50"
                      : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"
                  )}
                >
                  <Zap className={cn("w-4 h-4", paymentMethod === 'online' ? "fill-indigo-600" : "fill-none")} />
                  Online
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={cn(
                    "py-4 rounded-2xl font-bold transition-all text-sm flex items-center justify-center gap-2 border-2",
                    paymentMethod === 'cash'
                      ? "bg-amber-50 border-amber-600 text-amber-600 shadow-lg shadow-amber-100/50"
                      : "bg-slate-50 border-slate-100 text-slate-400 hover:bg-slate-100"
                  )}
                >
                  <Banknote className="w-4 h-4" />
                  Cash
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                  Subscription (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">₹</span>
                  <input 
                    type="number"
                    value={MONTHLY_AMOUNT}
                    disabled
                    className="w-full pl-7 pr-3 py-2.5 bg-white rounded-xl border border-slate-200 text-slate-700 font-bold text-sm outline-none cursor-not-allowed"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Fine / Late Fee (₹)
                  </label>
                  <span className={cn(
                    "text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider border",
                    isLatePaymentDate 
                      ? "bg-red-50 text-red-600 border-red-200" 
                      : "bg-slate-100 text-slate-400 border-slate-200"
                  )}>
                    {isLatePaymentDate ? "Active (>10th)" : "Inactive (≤10th)"}
                  </span>
                </div>
                <div className="relative">
                  <span className={cn(
                    "absolute left-3 top-1/2 -translate-y-1/2 font-bold text-sm",
                    isLatePaymentDate ? "text-red-600" : "text-slate-400"
                  )}>₹</span>
                  <input 
                    type="number"
                    value={isLatePaymentDate ? 100 : 0}
                    disabled
                    className="w-full pl-7 pr-3 py-2.5 bg-white rounded-xl border border-slate-200 text-slate-700 font-bold text-sm outline-none cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
            
            <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs font-bold text-indigo-700 uppercase">Total to Record</span>
              <span className="text-xl font-black text-indigo-900">₹{totalAmount.toLocaleString('en-IN')}</span>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting || (isAdmin && !selectedUserId)}
              className="flex-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Clock className="w-5 h-5 animate-spin" /> Recording...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" /> Record Payment
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
