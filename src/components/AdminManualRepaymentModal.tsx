import React from 'react';
import { motion } from 'motion/react';
import { format } from 'date-fns';
import { Loan, LoanPayment } from '../types';
import { cn } from '../lib/utils';
import { X, Zap, Banknote, CheckCircle2 } from 'lucide-react';

interface AdminManualRepaymentModalProps {
  isOpen: boolean;
  loan: Loan | null;
  month: number;
  year: number;
  amount: number;
  interest: number;
  method: 'Online' | 'Cash';
  paymentDate: string;
  onClose: () => void;
  setAmount: (amt: number) => void;
  setInterest: (int: number) => void;
  setPaymentDate: (d: string) => void;
  setMethod: (m: 'Online' | 'Cash') => void;
  submitRepayment: () => void;
}

export const AdminManualRepaymentModal: React.FC<AdminManualRepaymentModalProps> = ({
  isOpen,
  loan,
  month,
  year,
  amount,
  interest,
  method,
  paymentDate,
  onClose,
  setAmount,
  setInterest,
  setPaymentDate,
  setMethod,
  submitRepayment
}) => {
  if (!isOpen || !loan) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl p-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Admin Payment</h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-400" />
          </button>
        </div>

        <div className="space-y-6">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Loan ID: {loan.id?.slice(-6)}</p>
            <p className="text-sm text-slate-500 font-medium">For {format(new Date(year, month - 1), 'MMMM yyyy')}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Principal (₹)</label>
              <input 
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Interest (₹)</label>
              <input 
                type="number"
                value={interest}
                onChange={(e) => setInterest(Number(e.target.value))}
                className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Payment Date</label>
            <input 
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full p-4 bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">Payment Mode</label>
            <div className="flex gap-2">
              <button 
                onClick={() => setMethod('Online')}
                className={cn(
                  "flex-1 py-3 rounded-xl font-bold border transition-all flex items-center justify-center gap-2",
                  method === 'Online' ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200"
                )}
              >
                <Zap className="w-4 h-4" /> Online
              </button>
              <button 
                onClick={() => setMethod('Cash')}
                className={cn(
                  "flex-1 py-3 rounded-xl font-bold border transition-all flex items-center justify-center gap-2",
                  method === 'Cash' ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200"
                )}
              >
                <Banknote className="w-4 h-4" /> Cash
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
            <span className="text-xs font-bold text-indigo-700 uppercase">Total to Record</span>
            <span className="text-xl font-black text-indigo-900">₹{(amount + interest).toLocaleString('en-IN')}</span>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={onClose}
              className="flex-1 py-4 text-slate-600 font-bold hover:bg-slate-50 rounded-2xl transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={submitRepayment}
              className="flex-[1.5] py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 active:scale-95 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" /> Confirm Payment
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
